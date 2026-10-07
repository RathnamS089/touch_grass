import { ArrowLeft, MapPin, Navigation as NavigationIcon, Sparkles } from "lucide-react";
import type { OutdoorPlace } from "@/types/grounded";
import cubbon from "@/assets/cubbon-park.svg";
import lalbagh from "@/assets/lalbagh.svg";
import ulsoor from "@/assets/ulsoor-lake.svg";

interface OutdoorRecommendationProps {
  place: OutdoorPlace;
  onBack: () => void;
  onReset: () => void;
}

const visualByPlace: Record<string, string> = { "cubbon-park": cubbon, lalbagh, "ulsoor-lake": ulsoor };

export function OutdoorRecommendation({ place, onBack, onReset }: OutdoorRecommendationProps) {
  return (
    <section className="recommendation-page page-enter" aria-labelledby="place-name">
      <button className="text-button" type="button" onClick={onBack}><ArrowLeft size={17} /> Back</button>
      <article className="place-card">
        <div className="place-card__image"><img src={visualByPlace[place.id] ?? cubbon} alt="" /><span><Sparkles size={14} /> nearby, someday</span></div>
        <div className="place-card__body">
          <p className="eyebrow">A small outside option</p>
          <h1 id="place-name">{place.name}</h1>
          <p className="place-card__meta"><MapPin size={16} /> {place.category} · {place.distance}</p>
          <p className="place-card__description">{place.description}</p>
          <div className="place-card__actions">
            <button className="button button--primary" type="button" onClick={onReset}><NavigationIcon size={17} /> Let's go</button>
            <button className="button button--quiet" type="button" onClick={onReset}>Not now</button>
          </div>
        </div>
      </article>
      <p className="page-note">This is frontend mock data. Grounded isn't using your location.</p>
    </section>
  );
}
