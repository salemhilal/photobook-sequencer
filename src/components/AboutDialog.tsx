import { useEffect } from 'react';
import { ExternalLink, Mail, X } from 'lucide-react';
import { ui } from '../ui';

export function AboutDialog() {
  const close = () => ui.set({ aboutOpen: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="modal-backdrop" data-modal onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal about" data-modal role="dialog" aria-label="About Photobook Sequencer">
        <header className="modal-head">
          <div className="modal-title">About</div>
          <span className="spacer" />
          <button className="btn ghost icon" aria-label="Close" onClick={close}>
            <X />
          </button>
        </header>
        <div className="about-body">
          <span className="wordmark">SEQUENCER</span>
          <h2 className="about-name">Photobook Sequencer</h2>
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
      </div>
    </div>
  );
}
