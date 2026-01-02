import type React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/constants';

/** Quick link card configuration */
interface QuickLinkCard {
  path: string;
  title: string;
  description: string;
}

/** Quick link cards for practice modes */
const QUICK_LINKS: QuickLinkCard[] = [
  {
    path: ROUTES.CONVERSATION,
    title: 'Conversation Practice',
    description: 'Practice English conversations with AI assistance',
  },
  {
    path: ROUTES.PRONUNCIATION,
    title: 'Pronunciation Practice',
    description: 'Improve your pronunciation with real-time feedback',
  },
  {
    path: ROUTES.SCENARIOS,
    title: 'Real-Life Scenarios',
    description: 'Practice English in simulated real-world situations',
  },
];

/**
 * Home page - Landing page for the English Learning Tool
 * Displays welcome message and quick links to practice modes
 */
export const HomePage: React.FC = () => {
  return (
    <div className="page home-page">
      <header className="page-header">
        <h1 className="page-title">Welcome to English Practice</h1>
        <p className="page-description">
          AI-powered English learning designed for Vietnamese speakers. Choose a
          practice mode below to get started.
        </p>
      </header>

      <section className="quick-links">
        <h2 className="section-title">Practice Modes</h2>
        <div className="quick-links-grid">
          {QUICK_LINKS.map((link) => (
            <Link key={link.path} to={link.path} className="quick-link-card">
              <h3 className="card-title">{link.title}</h3>
              <p className="card-description">{link.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};
