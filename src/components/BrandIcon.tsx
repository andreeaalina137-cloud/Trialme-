import type { FC } from 'react';
import {
  BookOpen,
  Bot,
  CreditCard,
  Dumbbell,
  Film,
  Gamepad2,
  Package,
  Radio,
  Sparkles,
  Utensils,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  siApple,
  siAudible,
  siClaude,
  siDazn,
  siDeliveroo,
  siExpressvpn,
  siHeadspace,
  siHellofresh,
  siJusteat,
  siMonzo,
  siNetflix,
  siNordvpn,
  siNow,
  siParamountplus,
  siPlaystation,
  siRevolut,
  siSky,
  siSpotify,
  siStrava,
  siTesco,
  siTheguardian,
  siUber,
  siVirgin,
  siYoutube,
} from 'simple-icons';
import type { SubscriptionCategory } from '../types/subscription';

interface BrandIconProps {
  name: string;
  category: SubscriptionCategory;
  color?: string;
  size?: 'card' | 'preset';
}

function getCategoryIcon(category: SubscriptionCategory): LucideIcon {
  switch (category) {
    case 'Fitness & Gym':
      return Dumbbell;
    case 'News & Magazines':
      return BookOpen;
    case 'AI & Tech':
      return Bot;
    case 'Gaming':
      return Gamepad2;
    case 'Food & Delivery':
      return Utensils;
    case 'Utilities':
      return CreditCard;
    case 'Streaming':
      return Film;
    case 'Productivity':
      return Sparkles;
    case 'Music & Audio':
      return Radio;
    default:
      return Package;
  }
}

export const BrandIcon: FC<BrandIconProps> = ({
  name,
  category,
  color = '#D4AF7C',
  size = 'card',
}) => {
  const n = name.toLowerCase();
  const dimensions = size === 'preset' ? 'h-10 w-10 rounded-xl' : 'h-11 w-11 rounded-xl';
  const circleDimensions = size === 'preset' ? 'h-10 w-10 rounded-full' : 'h-11 w-11 rounded-full';
  const baseClass = `relative inline-flex shrink-0 items-center justify-center overflow-hidden shadow-md ${dimensions}`;
  const circleClass = `relative inline-flex shrink-0 items-center justify-center overflow-hidden shadow-md ${circleDimensions}`;

  // 1. NETFLIX — Jet black tile (#0A0A0A) + official Netflix red 'N' (#E50914)
  if (n.includes('netflix')) {
    return (
      <span className={`${baseClass} bg-[#0A0A0A] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siNetflix.path} fill="#E50914" />
        </svg>
      </span>
    );
  }

  // 2. SPOTIFY — Official Spotify green circle (#1DB954) with crisp black sound waves
  if (n.includes('spotify')) {
    return (
      <span className={`${circleClass} bg-[#0A0A0A]`} aria-hidden="true">
        <svg className="h-full w-full" viewBox="0 0 24 24" focusable="false">
          <path d={siSpotify.path} fill="#1DB954" />
        </svg>
      </span>
    );
  }

  // 3. AMAZON PRIME — Official Prime cyan-blue (#00A8E1) with white "prime" + smile arrow
  if (n.includes('amazon') || n.includes('prime')) {
    return (
      <span className={`${circleClass} bg-[#00A8E1] border border-white/15`} aria-hidden="true">
        <svg className="h-9 w-9" viewBox="0 0 40 40" focusable="false">
          <text
            x="20"
            y="20"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="10.5"
            fontWeight="800"
            fontFamily="Plus Jakarta Sans, Arial, sans-serif"
            letterSpacing="-0.3"
          >
            prime
          </text>
          <path
            d="M11 24.5C15.2 27.6 24.5 27.8 29.2 24.2"
            stroke="#FFFFFF"
            strokeWidth="2.1"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M27.2 23.4L29.8 24.0L28.7 26.5"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </span>
    );
  }

  // 4. DISNEY+ — Official royal blue (#113CCF -> #081648) with crisp white "Disney+" & arc
  if (n.includes('disney')) {
    return (
      <span
        className={`${circleClass} bg-gradient-to-b from-[#113CCF] to-[#081648] border border-white/20`}
        aria-hidden="true"
      >
        <svg className="h-9 w-9" viewBox="0 0 40 40" focusable="false">
          <path
            d="M10 18C14 11.5 25 11.5 30 17.5"
            stroke="#38BDF8"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
          <text
            x="20"
            y="24.5"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="9.2"
            fontWeight="800"
            fontFamily="Georgia, serif"
          >
            Disney+
          </text>
        </svg>
      </span>
    );
  }

  // 5. YOUTUBE PREMIUM — Crisp white tile (#FFFFFF) with official YouTube red play badge (#FF0000)
  if (n.includes('youtube')) {
    return (
      <span className={`${baseClass} bg-white border border-white/20`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siYoutube.path} fill="#FF0000" />
        </svg>
      </span>
    );
  }

  // 6. ADOBE CREATIVE CLOUD — Official Adobe red (#FA0F00) with crisp white 'A' mark
  if (n.includes('adobe')) {
    return (
      <span className={`${baseClass} bg-[#FA0F00] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" focusable="false">
          <path
            d="M14.8 3H21V21L14.8 3ZM9.2 3H3V21L9.2 3ZM12 9.4L16.1 21H13.1L11.8 17.1H8.7L12 9.4Z"
            fill="#FFFFFF"
          />
        </svg>
      </span>
    );
  }

  // 7. CHATGPT PLUS (OPENAI) — Crisp white tile (#FFFFFF) with dark OpenAI blossom knot
  if (n.includes('chatgpt') || n.includes('openai')) {
    return (
      <span className={`${baseClass} bg-white border border-white/20`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" focusable="false">
          <circle cx="12" cy="12" r="3.2" stroke="#0A0A0A" strokeWidth="1.8" />
          <ellipse cx="12" cy="12" rx="8.5" ry="4.2" stroke="#0A0A0A" strokeWidth="1.7" />
          <ellipse
            cx="12"
            cy="12"
            rx="8.5"
            ry="4.2"
            transform="rotate(60 12 12)"
            stroke="#0A0A0A"
            strokeWidth="1.7"
          />
          <ellipse
            cx="12"
            cy="12"
            rx="8.5"
            ry="4.2"
            transform="rotate(120 12 12)"
            stroke="#0A0A0A"
            strokeWidth="1.7"
          />
        </svg>
      </span>
    );
  }

  // 8. CANVA PRO — Official Canva teal-to-purple gradient with crisp white "Canva" script
  if (n.includes('canva')) {
    return (
      <span
        className={`${baseClass} bg-gradient-to-br from-[#00C4CC] via-[#5B46F6] to-[#7D2AE8] border border-white/20`}
        aria-hidden="true"
      >
        <svg className="h-9 w-9" viewBox="0 0 40 40" focusable="false">
          <text
            x="20"
            y="24"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="10.5"
            fontWeight="800"
            fontStyle="italic"
            fontFamily="Georgia, serif"
          >
            Canva
          </text>
        </svg>
      </span>
    );
  }

  // 9. APPLE TV+ / APPLE ICLOUD+ — Carbon black tile with official Apple mark
  if (n.includes('apple') || n.includes('icloud')) {
    return (
      <span className={`${baseClass} bg-[#141418] border border-white/15`} aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" focusable="false">
          <path d={siApple.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 10. AUDIBLE — Official Audible orange (#F8991D) with white Audible chevron
  if (n.includes('audible')) {
    return (
      <span className={`${baseClass} bg-[#F8991D] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siAudible.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 11. SKY STREAM & TV
  if (n.includes('sky')) {
    return (
      <span className={`${baseClass} bg-[#0072C9] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siSky.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 12. NOW TV
  if (n.includes('now tv') || n.includes('nowtv')) {
    return (
      <span className={`${baseClass} bg-[#00877C] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siNow.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 13. BBC TV LICENCE
  if (n.includes('bbc')) {
    return (
      <span className={`${baseClass} bg-[#B91C1C] border border-white/15`} aria-hidden="true">
        <span className="text-[11px] font-black tracking-widest text-white">BBC</span>
      </span>
    );
  }

  // 14. DAZN
  if (n.includes('dazn')) {
    return (
      <span className={`${baseClass} bg-[#0A0A0A] border border-white/20`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siDazn.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 15. PARAMOUNT+
  if (n.includes('paramount')) {
    return (
      <span className={`${baseClass} bg-[#0064FF] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siParamountplus.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 16. DISCOVERY+
  if (n.includes('discovery')) {
    return (
      <span className={`${baseClass} bg-[#0056FF] border border-white/15`} aria-hidden="true">
        <span className="text-sm font-black tracking-tight text-white">d+</span>
      </span>
    );
  }

  // 17. THE GUARDIAN
  if (n.includes('guardian')) {
    return (
      <span className={`${baseClass} bg-[#052962] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siTheguardian.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 18. PUREGYM
  if (n.includes('puregym')) {
    return (
      <span className={`${baseClass} bg-[#00A499] border border-white/15`} aria-hidden="true">
        <span className="text-[10px] font-black tracking-tight text-white">PURE</span>
      </span>
    );
  }

  // 19. THE GYM GROUP
  if (n.includes('gym group')) {
    return (
      <span className={`${baseClass} bg-[#FF5A00] border border-white/15`} aria-hidden="true">
        <span className="text-[10px] font-black tracking-tight text-white">GYM</span>
      </span>
    );
  }

  // 20. DAVID LLOYD
  if (n.includes('david lloyd')) {
    return (
      <span className={`${baseClass} bg-[#003B5C] border border-white/15`} aria-hidden="true">
        <span className="text-xs font-black tracking-tight text-white font-serif">DL</span>
      </span>
    );
  }

  // 21. JD GYMS
  if (n.includes('jd gyms')) {
    return (
      <span className={`${baseClass} bg-[#0A0A0A] border border-[#D4AF37]/60`} aria-hidden="true">
        <span className="text-xs font-black tracking-tight text-[#D4AF37]">JD</span>
      </span>
    );
  }

  // 22. VIRGIN ACTIVE
  if (n.includes('virgin')) {
    return (
      <span className={`${baseClass} bg-[#E10A0A] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siVirgin.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 23. STRAVA
  if (n.includes('strava')) {
    return (
      <span className={`${baseClass} bg-[#FC4C02] border border-white/15`} aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" focusable="false">
          <path d={siStrava.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 24. MYFITNESSPAL
  if (n.includes('myfitnesspal')) {
    return (
      <span className={`${baseClass} bg-[#0066EE] border border-white/15`} aria-hidden="true">
        <span className="text-[10px] font-black tracking-tight text-white">MFP</span>
      </span>
    );
  }

  // 25. WHOOP
  if (n.includes('whoop')) {
    return (
      <span className={`${baseClass} bg-[#0A0A0A] border border-[#10B981]/50`} aria-hidden="true">
        <span className="text-xs font-black tracking-tight text-[#10B981]">W</span>
      </span>
    );
  }

  // 26. HEADSPACE
  if (n.includes('headspace')) {
    return (
      <span className={`${baseClass} bg-[#F47D31] border border-white/15`} aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" focusable="false">
          <path d={siHeadspace.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 27. CALM
  if (n.includes('calm')) {
    return (
      <span
        className={`${baseClass} bg-gradient-to-b from-[#0284C7] to-[#1E3A8A] border border-white/15`}
        aria-hidden="true"
      >
        <span className="text-[10px] font-extrabold italic text-white font-serif">Calm</span>
      </span>
    );
  }

  // 28. PLAYSTATION PLUS
  if (n.includes('playstation')) {
    return (
      <span className={`${baseClass} bg-[#00439C] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siPlaystation.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 29. XBOX GAME PASS
  if (n.includes('xbox')) {
    return (
      <span className={`${baseClass} bg-[#107C10] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" focusable="false">
          <circle cx="12" cy="12" r="9" stroke="#FFFFFF" strokeWidth="1.8" />
          <path d="M7.5 6.5C10.5 9.5 13.5 13.5 16.5 17.5M16.5 6.5C13.5 9.5 10.5 13.5 7.5 17.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  // 30. NINTENDO SWITCH
  if (n.includes('nintendo')) {
    return (
      <span className={`${baseClass} bg-[#E60012] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" focusable="false">
          <rect x="4" y="4" width="7" height="16" rx="3.2" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx="7.5" cy="8.5" r="1.3" fill="#FFFFFF" />
          <rect x="13" y="4" width="7" height="16" rx="3.2" fill="#FFFFFF" />
          <circle cx="16.5" cy="14" r="1.3" fill="#E60012" />
        </svg>
      </span>
    );
  }

  // 31. CLAUDE PRO (ANTHROPIC)
  if (n.includes('claude') || n.includes('anthropic')) {
    return (
      <span className={`${baseClass} bg-[#D97757] border border-white/15`} aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" focusable="false">
          <path d={siClaude.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 32. GOOGLE ONE
  if (n.includes('google')) {
    return (
      <span className={`${baseClass} bg-white border border-white/20`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path
            d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5c-.2 1.2-1 2.3-2.1 3v2.5h3.4c2-1.8 3-4.5 3-7.3z"
            fill="#4285F4"
          />
          <path
            d="M12 22c2.7 0 5-.9 6.7-2.4l-3.4-2.5c-.9.6-2.1 1-3.3 1-2.6 0-4.8-1.7-5.6-4.1H2.9v2.6C4.6 19.9 8 22 12 22z"
            fill="#34A853"
          />
          <path
            d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H2.9C2.3 8.8 2 10.4 2 12s.3 3.2.9 4.6L6.4 14z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9C16.9 2.9 14.7 2 12 2 8 2 4.6 4.1 2.9 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z"
            fill="#EA4335"
          />
        </svg>
      </span>
    );
  }

  // 33. MICROSOFT 365
  if (n.includes('microsoft')) {
    return (
      <span className={`${baseClass} bg-white border border-white/20`} aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" focusable="false">
          <rect x="2" y="2" width="9.2" height="9.2" fill="#F25022" />
          <rect x="12.8" y="2" width="9.2" height="9.2" fill="#7FBA00" />
          <rect x="2" y="12.8" width="9.2" height="9.2" fill="#00A4EF" />
          <rect x="12.8" y="12.8" width="9.2" height="9.2" fill="#FFB900" />
        </svg>
      </span>
    );
  }

  // 34. NORDVPN
  if (n.includes('nordvpn')) {
    return (
      <span className={`${baseClass} bg-[#4687FF] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siNordvpn.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 35. EXPRESSVPN
  if (n.includes('expressvpn')) {
    return (
      <span className={`${baseClass} bg-[#DA3940] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siExpressvpn.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 36. DELIVEROO
  if (n.includes('deliveroo')) {
    return (
      <span className={`${baseClass} bg-[#00CDBC] border border-white/15`} aria-hidden="true">
        <svg className="h-6 w-6" viewBox="0 0 24 24" focusable="false">
          <path d={siDeliveroo.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 37. UBER ONE
  if (n.includes('uber')) {
    return (
      <span className={`${baseClass} bg-[#0A0A0A] border border-white/20`} aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" focusable="false">
          <path d={siUber.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 38. JUST EAT
  if (n.includes('just eat') || n.includes('justeat')) {
    return (
      <span className={`${baseClass} bg-[#FF8000] border border-white/15`} aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" focusable="false">
          <path d={siJusteat.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 39. HELLOFRESH
  if (n.includes('hellofresh')) {
    return (
      <span className={`${baseClass} bg-[#16A34A] border border-white/15`} aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" focusable="false">
          <path d={siHellofresh.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 40. GOUSTO
  if (n.includes('gousto')) {
    return (
      <span className={`${baseClass} bg-[#E42313] border border-white/15`} aria-hidden="true">
        <span className="text-sm font-black text-white font-serif">G</span>
      </span>
    );
  }

  // 41. CLUB PRET
  if (n.includes('pret')) {
    return (
      <span className={`${baseClass} bg-[#8B1D41] border border-white/15`} aria-hidden="true">
        <span className="text-[10px] font-black tracking-wider text-white">PRET</span>
      </span>
    );
  }

  // 42. TESCO
  if (n.includes('tesco')) {
    return (
      <span className={`${baseClass} bg-[#00539F] border border-white/15`} aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" focusable="false">
          <path d={siTesco.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // 43. ASOS PREMIER
  if (n.includes('asos')) {
    return (
      <span className={`${baseClass} bg-white border border-white/20`} aria-hidden="true">
        <span className="text-[11px] font-black tracking-tighter text-[#0A0A0A] lowercase">asos</span>
      </span>
    );
  }

  // 44. EXPERIAN
  if (n.includes('experian')) {
    return (
      <span className={`${baseClass} bg-[#1D4ED8] border border-white/15`} aria-hidden="true">
        <span className="text-sm font-black text-white">e</span>
      </span>
    );
  }

  // 45. CLEARSCORE
  if (n.includes('clearscore')) {
    return (
      <span className={`${baseClass} bg-[#0F172A] border border-[#06B6D4]/50`} aria-hidden="true">
        <span className="text-xs font-black text-[#06B6D4]">CS</span>
      </span>
    );
  }

  // 46. EQUIFAX
  if (n.includes('equifax')) {
    return (
      <span className={`${baseClass} bg-[#B91C1C] border border-white/15`} aria-hidden="true">
        <span className="text-[10px] font-black tracking-tight text-white">EFX</span>
      </span>
    );
  }

  // 47. MONZO
  if (n.includes('monzo')) {
    return (
      <span className={`${baseClass} bg-[#14233C] border border-white/15`} aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" focusable="false">
          <path d={siMonzo.path} fill="#FF365D" />
        </svg>
      </span>
    );
  }

  // 48. REVOLUT
  if (n.includes('revolut')) {
    return (
      <span className={`${baseClass} bg-[#0A0A0A] border border-white/20`} aria-hidden="true">
        <svg className="h-5 w-5" viewBox="0 0 24 24" focusable="false">
          <path d={siRevolut.path} fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  // Default fallback: Solid brand color tile + sharp white category icon (no blur or fog)
  const FallbackIcon = getCategoryIcon(category);
  return (
    <span
      className={`${baseClass} border border-white/15`}
      style={{ backgroundColor: color || '#161616' }}
      aria-hidden="true"
    >
      <FallbackIcon className="h-5 w-5 text-white" strokeWidth={2.3} />
    </span>
  );
};
