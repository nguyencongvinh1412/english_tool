/**
 * Speech Routes
 * POST /api/speech/assess: a recorded WAV clip → transcript, pronunciation issues, fluency
 * Audio is processed in memory and never stored.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { currentUser, limitAiRequests, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { assertQuota, recordUsage } from '../services/aiAccess.js';
import { audioTokens, inputTokens } from '../billing/pricing.js';
import { runSpeechEngine } from '../speech/engine.js';
import { postProcess } from '../speech/postProcess.js';
import { speechSystemPrompt, speechUserText } from '../speech/prompt.js';
import { readWav } from '../speech/wav.js';
import type { AssessInput } from '../speech/types.js';

/** Usage bucket; counts toward the same daily quota and credits as every AI feature */
const SPEECH_FEATURE = 'speech';
/** 180 s of 16 kHz mono 16-bit WAV is about 5.8 MB */
const MAX_BYTES = 6 * 1024 * 1024;
export const MIN_SEC = 0.5;
/** IELTS Part 2 is up to 2 minutes; leave room for the learner to finish a sentence */
export const MAX_SEC = 180;

const fieldsSchema = z
  .object({
    mode: z.enum(['read', 'answer', 'transcribe']),
    reference: z.string().trim().min(1).max(300).optional(),
    question: z.string().trim().min(1).max(500).optional(),
  })
  .refine((f) => f.mode !== 'read' || f.reference, { message: 'Read mode needs the reference sentence', path: ['reference'] });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 5 } }).single('audio');

/** Multer errors (file too large...) as 400s */
function receiveAudio(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(new HttpError(400, error.code === 'LIMIT_FILE_SIZE' ? 'The recording is too long.' : 'Invalid upload.', 'invalid_audio'));
      return;
    }
    next(error);
  });
}

export function createSpeechRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  /**
   * @route POST /api/speech/assess
   * @body multipart: audio (WAV), mode (read|answer|transcribe), reference? (read), question? (answer)
   * @returns SpeechAssessment
   * @throws 400 invalid audio or fields · 429 quota · 503 speech_unavailable (client falls back to browser recognition)
   */
  router.post('/assess', limitAiRequests, receiveAudio, async (req: Request, res: Response): Promise<void> => {
    const fields = fieldsSchema.parse(req.body);
    const file = req.file;
    if (!file) throw new HttpError(400, 'No recording was sent.', 'invalid_audio');

    const wav = readWav(file.buffer);
    if (!wav) throw new HttpError(400, 'The recording is not a WAV file.', 'invalid_audio');
    if (wav.durationSec < MIN_SEC) throw new HttpError(400, 'The recording is too short.', 'audio_too_short');
    if (wav.durationSec > MAX_SEC) throw new HttpError(400, 'The recording is too long.', 'invalid_audio');

    const user = currentUser(req);
    await assertQuota(user, SPEECH_FEATURE);

    const input: AssessInput = { mode: fields.mode, reference: fields.reference, question: fields.question, durationSec: wav.durationSec };
    const result = await runSpeechEngine(input, file.buffer);

    const textTokens = inputTokens(speechSystemPrompt(input.mode), [{ role: 'user', content: speechUserText(input) }]);
    await recordUsage(user, SPEECH_FEATURE, { model: result.model, inputTokens: textTokens + audioTokens(wav.durationSec), reply: result.reply });
    if (!result.raw.transcript) throw new HttpError(422, 'No speech was heard in the recording.', 'no_speech');

    res.json(postProcess(result.raw, input, { model: result.model, accuracy: result.accuracy }));
  });

  return router;
}
