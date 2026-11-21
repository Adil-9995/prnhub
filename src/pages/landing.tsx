import { useState } from 'react'
import { ArrowRight, Check, LockKeyhole, Menu, MessageSquare, ShieldCheck, Video, X, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { APP_NAME, CURRENT_YEAR } from '../config'

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link className="brand" to="/"><span className="brand-mark"><Video size={18} /></span>{APP_NAME}</Link>
        <nav className={`landing-links ${menuOpen ? 'open' : ''}`} aria-label="Landing page navigation">
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a><a href="#privacy" onClick={() => setMenuOpen(false)}>Privacy</a><Link to="/signin" onClick={() => setMenuOpen(false)}>Sign in</Link><Link to="/signup" onClick={() => setMenuOpen(false)}>Create account</Link>
        </nav>
        <button className="icon-button landing-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
        <div className="landing-actions">
          <Link className="btn btn-secondary" to="/signin">Sign in</Link>
          <Link className="btn btn-primary" to="/signup">Create account <ArrowRight size={14} /></Link>
        </div>
      </header>
      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="eyebrow">A calmer way to connect</span>
            <h1>Good meetings.<br /><em>Better flow.</em></h1>
            <p>Bring your people together with video calls that feel effortless. Less setup, more of what matters.</p>
            <div className="landing-hero-actions">
              <Link to="/create" className="btn btn-primary">Start a meeting <ArrowRight size={15} /></Link>
              <Link to="/join" className="btn btn-secondary">Join a meeting</Link>
            </div>
            <div className="landing-note"><Check size={14} /> No downloads. No complicated setup.</div>
          </div>
          <div className="hero-visual" aria-label="FOSSHub meeting interface illustration">
            <div className="hero-window">
              <div className="hero-window-top"><span>FOSSHub classroom</span><span>Live room</span></div>
              <div className="hero-people">
                <div className="hero-person">Class</div><div className="hero-person">Talk</div>
                <div className="hero-person">Share</div><div className="hero-person">Learn</div>
              </div>
            </div>
            <div className="hero-float">✦ &nbsp; Everyone’s in sync</div>
          </div>
        </section>
        <section className="feature-section" id="features">
          <span className="eyebrow">Thoughtful by design</span>
          <h2>Everything you need to connect</h2>
          <p>Simple, familiar tools that keep the conversation moving.</p>
          <div className="feature-grid">
            <article className="feature-card"><div className="quick-icon"><Zap size={19} /></div><strong>One-click meetings</strong><p>Start a room in seconds or share a link to bring everyone together.</p></article>
            <article className="feature-card"><div className="quick-icon"><MessageSquare size={19} /></div><strong>Stay in the conversation</strong><p>Chat, react, and raise a hand without interrupting the flow.</p></article>
            <article className="feature-card" id="privacy"><div className="quick-icon"><ShieldCheck size={19} /></div><strong>Privacy, built in</strong><p>Your camera and microphone stay under your control. Preview before you join.</p></article>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Link className="brand" to="/"><span className="brand-mark"><Video size={16} /></span>{APP_NAME}</Link>
        <span>© {CURRENT_YEAR} {APP_NAME}. Thoughtful meetings for everyone.</span>
        <span><LockKeyhole size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Privacy-first by design</span>
      </footer>
    </div>
  )
}
