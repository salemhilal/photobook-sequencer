import { CodeXml, ExternalLink, Mail, Shield } from 'lucide-react';
import { closeModal } from '../ui';
import { Dialog } from './Dialog';

export function AboutDialog() {
  return (
    <Dialog title="About" label="About Sequence" onClose={closeModal} className="about">
      <div className="about-body">
        <span className="wordmark">SEQUENCE</span>
        <h2 className="about-name">Sequence</h2>
        <p className="about-version data muted">Version {__APP_VERSION__}</p>
        <p className="about-tagline">A tool for playing with photo sequences.</p>
        <div className="about-links">
          <a href="https://salem.io" target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            salem.io
          </a>
          <a href="mailto:hi@sequence.photos">
            <Mail />
            hi@sequence.photos
          </a>
          <a href="https://github.com/salemhilal/sequence.photos" target="_blank" rel="noopener noreferrer">
            <CodeXml />
            Source on GitHub
          </a>
          <a href={`https://${import.meta.env.VITE_SITE_DOMAIN}/privacy/`} target="_blank" rel="noopener noreferrer">
            <Shield />
            Privacy policy
          </a>
        </div>
        <p className="about-copyright data muted">© {new Date().getFullYear()} Salem Hilal</p>
      </div>
    </Dialog>
  );
}
