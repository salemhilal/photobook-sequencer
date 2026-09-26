import { ExternalLink, Mail } from 'lucide-react';
import { closeModal } from '../ui';
import { Dialog } from './Dialog';

export function AboutDialog() {
  return (
    <Dialog title="About" label="About Photobook Sequencer" onClose={closeModal} className="about">
      <div className="about-body">
        <span className="wordmark">SEQUENCER</span>
        <h2 className="about-name">Photobook Sequencer</h2>
        <p className="about-version data muted">Version {__APP_VERSION__}</p>
        <p className="about-tagline">A tool for prototyping photo sequences</p>
        <div className="about-links">
          <a href="https://salem.io" target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            salem.io
          </a>
          <a href="mailto:sequencer@salem.io">
            <Mail />
            sequencer@salem.io
          </a>
        </div>
        <p className="about-copyright data muted">© {new Date().getFullYear()} Salem Hilal</p>
      </div>
    </Dialog>
  );
}
