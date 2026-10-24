import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

interface CalendarProps {
  value: string; // Format YYYY-MM-DD
  onChange: (date: string) => void;
  minDate?: string; // Format YYYY-MM-DD
  maxDate?: string; // Format YYYY-MM-DD
  className?: string;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

const monthNames = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

// Jours de la semaine avec lundi en premier (1=lundi, 7=dimanche)
const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

type CalendarPlacement = {
  top: number;
  left: number;
  width: number;
  maxHeight?: number;
};

export function Calendar({ value, onChange, minDate, maxDate, className = '' }: CalendarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<CalendarPlacement>({
    top: 0,
    left: 0,
    width: 320,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (value) {
      const date = new Date(value + 'T00:00:00');
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });

  // Réinitialiser isOpen quand value devient vide (pour permettre la réouverture)
  useEffect(() => {
    if (!value) {
      setIsOpen(false);
    }
  }, [value]);

  // Placer le calendrier entièrement dans la viewport (mesuré, pas d’estimation fixe)
  useEffect(() => {
    if (!isOpen) return;

    const MARGIN = 12;
    const GAP = 8;

    const updatePosition = () => {
      if (!triggerRef.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isMobile = vw < 640;
      const measured = calendarRef.current;
      const naturalH = measured?.scrollHeight || measured?.offsetHeight || 440;
      const naturalW = measured?.offsetWidth;
      const maxAvailH = Math.max(200, vh - MARGIN * 2);

      let width = isMobile
        ? Math.min(vw * 0.95, 320)
        : Math.max(rect.width, 280);
      if (naturalW && isMobile) width = Math.min(naturalW, vw - MARGIN * 2);

      let left = isMobile ? (vw - width) / 2 : rect.left;
      left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - width - MARGIN));

      const spaceBelow = vh - rect.bottom - MARGIN;
      const spaceAbove = rect.top - MARGIN;
      let top: number;
      let maxHeight: number | undefined;

      if (naturalH + GAP <= spaceBelow) {
        top = rect.bottom + GAP;
      } else if (naturalH + GAP <= spaceAbove) {
        top = rect.top - naturalH - GAP;
      } else {
        // Ne tient ni au-dessus ni en dessous → ancré dans la fenêtre
        maxHeight = maxAvailH;
        const usedH = Math.min(naturalH, maxAvailH);
        if (spaceBelow >= spaceAbove && spaceBelow >= 160) {
          top = rect.bottom + GAP;
          maxHeight = Math.max(160, vh - top - MARGIN);
        } else if (spaceAbove >= 160) {
          maxHeight = Math.max(160, spaceAbove - GAP);
          top = rect.top - Math.min(naturalH, maxHeight) - GAP;
        } else {
          // Centrer verticalement dans la viewport
          top = Math.max(MARGIN, (vh - usedH) / 2);
          maxHeight = maxAvailH;
        }
      }

      const usedH = maxHeight ? Math.min(naturalH, maxHeight) : naturalH;
      if (top + usedH > vh - MARGIN) {
        top = Math.max(MARGIN, vh - MARGIN - usedH);
      }
      if (top < MARGIN) top = MARGIN;
      // Si toujours trop haut pour la fenêtre, forcer le scroll interne
      if (top + naturalH > vh - MARGIN && !maxHeight) {
        maxHeight = vh - top - MARGIN;
      }

      setPosition({ top, left, width, maxHeight });
    };

    updatePosition();
    // Après paint : dimensions réelles du popup
    const raf = requestAnimationFrame(() => {
      updatePosition();
      requestAnimationFrame(updatePosition);
    });
    const t = window.setTimeout(updatePosition, 60);

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, currentMonth]);

  const selectedDate = value ? new Date(value + 'T00:00:00') : null;
  const minDateObj = minDate ? new Date(minDate + 'T00:00:00') : null;
  const maxDateObj = maxDate ? new Date(maxDate + 'T00:00:00') : null;

  const formatDateDisplay = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDate();
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const getDaysInMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  /**
   * Convertit getDay() (0=dimanche, 1=lundi...) en numérotation basée sur lundi
   * Retourne 1=lundi, 2=mardi, ..., 7=dimanche
   */
  const getDayOfWeekMondayBased = (date: Date): number => {
    // getDay() retourne 0=dimanche, 1=lundi, ..., 6=samedi
    // On veut 1=lundi, 2=mardi, ..., 7=dimanche
    const jsDay = date.getDay(); // 0=dimanche, 1=lundi, ..., 6=samedi
    // Conversion: dimanche(0) -> 7, lundi(1) -> 1, mardi(2) -> 2, ..., samedi(6) -> 6
    return jsDay === 0 ? 7 : jsDay;
  };

  const getFirstDayOfMonth = (date: Date): number => {
    // Retourner le jour de la semaine basé sur lundi (1=lundi, 7=dimanche)
    return getDayOfWeekMondayBased(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const isDateDisabled = (date: Date): boolean => {
    if (minDateObj && date < minDateObj) return true;
    if (maxDateObj && date > maxDateObj) return true;
    return false;
  };

  const isDateSelected = (date: Date): boolean => {
    if (!selectedDate) return false;
    return date.toISOString().split('T')[0] === selectedDate.toISOString().split('T')[0];
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date.toISOString().split('T')[0] === today.toISOString().split('T')[0];
  };

  const handleDateClick = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    date.setHours(0, 0, 0, 0);
    const dateStr = formatDateLocal(date);
    if (!isDateDisabled(date)) {
      onChange(dateStr);
      setIsOpen(false);
    }
  };

  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    if (!isDateDisabled(today)) {
      onChange(formatDateLocal(today));
    }
  };

  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const days: (number | null)[] = [];

  // Ajouter les jours vides du début (pour aligner avec lundi)
  // firstDay est maintenant 1=lundi, 7=dimanche, donc on soustrait 1 pour avoir l'index (0-6)
  for (let i = 1; i < firstDay; i++) {
    days.push(null);
  }

  // Ajouter les jours du mois
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  return (
    <>
      <div className={`relative ${className}`}>
        {/* Input trigger */}
        <motion.button
          ref={triggerRef}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(prev => !prev);
          }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="w-full px-3 sm:px-4 md:px-5 py-3 sm:py-4 bg-white rounded-xl border-2 border-slate-300 text-left font-bold text-sm sm:text-base md:text-lg text-slate-900 hover:border-primary-500 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-200 transition-all flex items-center justify-between shadow-sm min-h-[48px] sm:min-h-[52px] active:scale-95"
        >
          <span className={value ? 'text-slate-900' : 'text-slate-400 font-normal'}>
            {value ? formatDateDisplay(value) : 'Sélectionner une date'}
          </span>
          <span className="text-2xl">📅</span>
        </motion.button>
      </div>

      {/* Calendar popup via portal */}
      {typeof window !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="fixed inset-0 bg-black/20 md:bg-transparent z-[9998]"
              />
              
              {/* Calendar — toujours contenu dans la viewport */}
              <motion.div
                ref={calendarRef}
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={springConfig}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: position.top,
                  left: position.left,
                  width: position.width,
                  maxHeight: position.maxHeight,
                  overflowY: position.maxHeight ? 'auto' : undefined,
                  zIndex: 9999,
                }}
                className="bg-white rounded-xl sm:rounded-2xl shadow-2xl border-2 border-slate-200 p-3 sm:p-4 min-w-[280px] max-w-[calc(100vw-24px)]"
              >
              {/* Header avec navigation */}
              <div className="flex items-center justify-between mb-4">
                <motion.button
                  onClick={goToPreviousMonth}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors min-w-[44px] min-h-[44px] active:scale-90"
                >
                  <span className="text-xl">‹</span>
                </motion.button>
                
                <div className="text-center">
                  <div className="text-base sm:text-lg font-bold text-slate-900">
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                  </div>
                  <motion.button
                    onClick={goToToday}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="text-xs sm:text-sm text-primary-500 hover:text-primary-600 font-semibold mt-1 px-2 py-1 rounded-lg hover:bg-primary-50 min-h-[32px] active:scale-95"
                  >
                    Aujourd'hui
                  </motion.button>
                </div>
                
                <motion.button
                  onClick={goToNextMonth}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors min-w-[44px] min-h-[44px] active:scale-90"
                >
                  <span className="text-xl">›</span>
                </motion.button>
              </div>

              {/* Jours de la semaine */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {dayNames.map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs font-bold text-slate-500 py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Grille du calendrier */}
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, index) => {
                  if (day === null) {
                    return <div key={`empty-${index}`} className="aspect-square" />;
                  }

                  const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                  date.setHours(0, 0, 0, 0);
                  const disabled = isDateDisabled(date);
                  const selected = isDateSelected(date);
                  const today = isToday(date);

                  return (
                    <motion.button
                      key={day}
                      onClick={() => handleDateClick(day)}
                      disabled={disabled}
                      whileHover={!disabled ? { scale: 1.1 } : {}}
                      whileTap={!disabled ? { scale: 0.9 } : {}}
                      className={`
                        aspect-square rounded-lg text-xs sm:text-sm font-semibold transition-all min-h-[36px] sm:min-h-[40px] min-w-[36px] sm:min-w-[40px]
                        ${disabled
                          ? 'text-slate-300 cursor-not-allowed'
                          : selected
                          ? 'bg-primary-500 text-white shadow-lg active:scale-90'
                          : today
                          ? 'bg-primary-100 text-primary-700 font-bold border-2 border-primary-300 active:scale-90'
                          : 'text-slate-700 hover:bg-slate-100 active:scale-90'
                        }
                      `}
                    >
                      {day}
                    </motion.button>
                  );
                })}
              </div>

              {/* Bouton fermer */}
              <div className="mt-4 pt-4 border-t border-slate-200">
                <motion.button
                  onClick={() => setIsOpen(false)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full px-4 py-2.5 sm:py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors min-h-[44px] text-sm sm:text-base active:scale-95"
                >
                  Fermer
                </motion.button>
              </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

