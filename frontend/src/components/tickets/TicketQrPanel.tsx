import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";

export function TicketQrPanel({
  value,
  title,
  subtitle,
  className,
}: {
  value: string;
  title: string;
  subtitle: string;
  className?: string;
}) {
  // 1. On tente de parser le contenu du QR pour voir si c'est un QR Dynamique (JSON)
  const deadline = useMemo(() => {
    try {
      const parsed = JSON.parse(value);
      if (parsed.deadline) {
        return Number(parsed.deadline);
      }
    } catch (e) {
      // Ce n'est pas un JSON (c'est l'ancien format URL statique), on ignore.
    }
    return null;
  }, [value]);

  // 2. État pour le temps restant
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // 3. Mise en place du chronomètre de rafraîchissement
  useEffect(() => {
    if (!deadline) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = deadline - now;
      setTimeLeft(remaining > 0 ? remaining : 0);
    };

    updateTimer(); // Initialisation immédiate
    const interval = setInterval(updateTimer, 1000); // Mise à jour chaque seconde

    return () => clearInterval(interval);
  }, [deadline]);

  return (
    <div className={className ? `ticket-qr-panel ${className}` : "ticket-qr-panel"}>
      <div className="ticket-qr-shell">
        <QRCode
          size={132}
          value={value}
          // Feedback visuel : on grise le QR code s'il est expiré le temps que le parent le recharge
          bgColor={timeLeft === 0 ? "#f8f9fa" : "#ffffff"}
          fgColor={timeLeft === 0 ? "#adb5bd" : "#08101b"}
          viewBox="0 0 256 256"
        />
      </div>
      
      {/* 4. Affichage du compte à rebours SI c'est un QR dynamique */}
      {deadline !== null && (
        <div 
          style={{ 
            marginTop: "12px", 
            fontSize: "0.85rem", 
            fontWeight: "600",
            // Rouge si expiré, Bleu (ou couleur primaire) si actif
            color: timeLeft === 0 ? "#e74c3c" : "#3b82f6",
            textAlign: "center"
          }}
        >
          {timeLeft !== null && timeLeft > 0 
            ? `Securisé • S'actualise dans ${timeLeft}s` 
            : "QR Code expiré, actualisation..."}
        </div>
      )}

      <div className="ticket-qr-copy" style={{ marginTop: deadline !== null ? "4px" : "16px" }}>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}
