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

const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export function Calendar({ value, onChange, minDate, maxDate, className = '' }: CalendarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (value) {
      const date = new Date(value + 'T00:00:00');
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });

  // Calculer la position du calendrier
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const calendarWidth = 320; // min-w-[320px]
      const calendarHeight = 400; // estimation
      
      let left = rect.left + window.scrollX;
      let top = rect.bottom + window.scrollY + 8;
      
      // Ajuster si le calendrier dépasse à droite
      if (left + calendarWidth > viewportWidth) {
        left = viewportWidth - calendarWidth - 16;
      }
      
      // Ajuster si le calendrier dépasse en bas (afficher au-dessus)
      if (top + calendarHeight > viewportHeight + window.scrollY) {
        top = rect.top + window.scrollY - calendarHeight - 8;
      }
      
      // S'assurer que le calendrier ne dépasse pas à gauche
      if (left < 16) {
        left = 16;
      }
      
      setPosition({ top, left });
    }
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

  const getFirstDayOfMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
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

  // Ajouter les jours vides du début
  for (let i = 0; i < firstDay; i++) {
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
          onClick={() => setIsOpen(!isOpen)}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="w-full px-5 py-4 bg-white rounded-xl border-2 border-slate-300 text-left font-bold text-base sm:text-lg text-slate-900 hover:border-primary-500 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-200 transition-all flex items-center justify-between shadow-sm"
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
                className="fixed inset-0 bg-black/20 z-[55]"
              />
              
              {/* Calendar */}
              <motion.div
                ref={calendarRef}
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={springConfig}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: `${position.top}px`,
                  left: `${position.left}px`,
                  zIndex: 60
                }}
                className="bg-white rounded-2xl shadow-2xl border-2 border-slate-200 p-4 w-full min-w-[320px] max-w-[400px]"
              >
              {/* Header avec navigation */}
              <div className="flex items-center justify-between mb-4">
                <motion.button
                  onClick={goToPreviousMonth}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <span className="text-xl">‹</span>
                </motion.button>
                
                <div className="text-center">
                  <div className="text-lg font-bold text-slate-900">
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                  </div>
                  <motion.button
                    onClick={goToToday}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="text-xs text-primary-500 hover:text-primary-600 font-semibold mt-1"
                  >
                    Aujourd'hui
                  </motion.button>
                </div>
                
                <motion.button
                  onClick={goToNextMonth}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
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
                        aspect-square rounded-lg text-sm font-semibold transition-all
                        ${disabled
                          ? 'text-slate-300 cursor-not-allowed'
                          : selected
                          ? 'bg-primary-500 text-white shadow-lg'
                          : today
                          ? 'bg-primary-100 text-primary-700 font-bold border-2 border-primary-300'
                          : 'text-slate-700 hover:bg-slate-100'
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
                  className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors"
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

