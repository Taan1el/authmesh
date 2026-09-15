import React from 'react';
import { isDemoMode, resetDemoData } from '../services/index.js';

interface DemoBannerProps {
  onReset: () => void;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ onReset }) => {
  if (!isDemoMode) return null;

  const handleReset = () => {
    if (window.confirm('Reset the simulated organization back to the seed data?')) {
      resetDemoData();
      onReset();
    }
  };

  return (
    <div className="demo-banner" role="status">
      <span>
        Demo mode: this is a static build running entirely in your browser, with simulated data
        that never leaves your device. Clone the repo and run <code>npm install &amp;&amp; npm run dev</code>{' '}
        for the full stack with a real API and database.{' '}
        <a href="https://github.com/Taan1el/authmesh" target="_blank" rel="noreferrer">
          View source on GitHub
        </a>
      </span>
      <button type="button" className="btn btn-secondary btn-xs" onClick={handleReset}>
        Reset demo data
      </button>
    </div>
  );
};
