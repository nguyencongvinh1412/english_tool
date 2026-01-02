/**
 * Web Speech API type declarations
 * Provides TypeScript support for SpeechRecognition API
 */

/** Speech recognition result item */
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

/** Single recognition result */
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

/** List of recognition results */
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

/** Speech recognition event with results */
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

/** Speech recognition error event */
interface SpeechRecognitionErrorEvent extends Event {
  readonly error:
    | 'no-speech'
    | 'aborted'
    | 'audio-capture'
    | 'network'
    | 'not-allowed'
    | 'service-not-allowed'
    | 'bad-grammar'
    | 'language-not-supported';
  readonly message: string;
}

/** SpeechRecognition interface */
interface SpeechRecognition extends EventTarget {
  /** Language for recognition (BCP 47 language tag) */
  lang: string;
  /** Whether to return continuous results */
  continuous: boolean;
  /** Whether to return interim results */
  interimResults: boolean;
  /** Maximum number of alternative transcriptions */
  maxAlternatives: number;

  /** Start recognition */
  start(): void;
  /** Stop recognition */
  stop(): void;
  /** Abort recognition */
  abort(): void;

  /** Fired when recognition starts */
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  /** Fired when recognition ends */
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  /** Fired when a result is received */
  onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
    | null;
  /** Fired when an error occurs */
  onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void)
    | null;
  /** Fired when audio capture starts */
  onaudiostart: ((this: SpeechRecognition, ev: Event) => void) | null;
  /** Fired when audio capture ends */
  onaudioend: ((this: SpeechRecognition, ev: Event) => void) | null;
  /** Fired when sound is detected */
  onsoundstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  /** Fired when sound ends */
  onsoundend: ((this: SpeechRecognition, ev: Event) => void) | null;
  /** Fired when speech is detected */
  onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  /** Fired when speech ends */
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
  /** Fired when no match is found */
  onnomatch:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
    | null;
}

/** SpeechRecognition constructor type */
interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
  prototype: SpeechRecognition;
}

/** Extend Window interface with SpeechRecognition */
interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
