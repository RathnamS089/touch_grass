import { ArrowLeft, Check, HeartHandshake, ShieldCheck } from "lucide-react";

interface PrivacyProps { onBack: () => void; }
const neverCollected = ["keyboard input", "mouse movements", "screenshots", "screen contents", "websites", "files", "clipboard contents", "applications"];

export function Privacy({ onBack }: PrivacyProps) {
  return <section className="content-page privacy-page page-enter" aria-labelledby="privacy-title"><button className="text-button" type="button" onClick={onBack}><ArrowLeft size={17} /> Grounded</button><div className="privacy-hero"><span><ShieldCheck size={27} /></span><p className="eyebrow">A design promise</p><h1 id="privacy-title">Your privacy matters.</h1><p>Grounded is designed to help you step away from your screen, not watch what you do on it.</p></div><section className="privacy-card"><h2>Grounded does not record</h2><ul>{neverCollected.map((item) => <li key={item}><Check size={17} /> {item}</li>)}</ul></section><p className="privacy-footnote"><HeartHandshake size={16} /> This screen represents the intended product philosophy. No monitoring exists in this frontend demo.</p></section>;
}
