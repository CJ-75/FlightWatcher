#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de test pour vérifier la génération des dates des presets
"""
from datetime import date, timedelta
from typing import List, Tuple

class DateAvecHoraire:
    def __init__(self, date: str, heure_min: str, heure_max: str):
        self.date = date
        self.heure_min = heure_min
        self.heure_max = heure_max
    
    def __repr__(self):
        return f"DateAvecHoraire(date='{self.date}', heure_min='{self.heure_min}', heure_max='{self.heure_max}')"

def get_dates_from_preset(preset: str) -> Tuple[List[DateAvecHoraire], List[DateAvecHoraire]]:
    """
    Convertit un preset de dates en listes de DateAvecHoraire pour aller et retour
    """
    today = date.today()
    dates_depart = []
    dates_retour = []
    
    if preset == 'weekend':
        # Ce weekend : vendredi-dimanche prochain
        days_until_friday = (4 - today.weekday()) % 7
        if days_until_friday == 0 and today.weekday() >= 4:
            days_until_friday = 7  # Si on est déjà vendredi ou après, prendre le suivant
        
        friday = today + timedelta(days=days_until_friday)
        sunday = friday + timedelta(days=2)
        
        dates_depart.append(DateAvecHoraire(date=friday.isoformat(), heure_min="06:00", heure_max="23:59"))
        dates_retour.append(DateAvecHoraire(date=sunday.isoformat(), heure_min="06:00", heure_max="23:59"))
        
    elif preset == 'next-weekend':
        # Weekend prochain : vendredi-dimanche suivant
        days_until_friday = (4 - today.weekday()) % 7
        if days_until_friday == 0:
            days_until_friday = 7
        else:
            days_until_friday += 7
        
        friday = today + timedelta(days=days_until_friday)
        sunday = friday + timedelta(days=2)
        
        dates_depart.append(DateAvecHoraire(date=friday.isoformat(), heure_min="06:00", heure_max="23:59"))
        dates_retour.append(DateAvecHoraire(date=sunday.isoformat(), heure_min="06:00", heure_max="23:59"))
        
    elif preset == 'next-week':
        # 3 jours la semaine prochaine : vendredi-dimanche
        # Horaires : 23h00 à 6h00 (plage qui traverse minuit)
        days_until_friday = (4 - today.weekday()) % 7
        if days_until_friday == 0 and today.weekday() >= 4:
            days_until_friday = 7  # Si on est déjà vendredi ou après, prendre le suivant
        else:
            days_until_friday += 7  # Semaine prochaine
        
        friday = today + timedelta(days=days_until_friday)
        sunday = friday + timedelta(days=2)
        
        dates_depart.append(DateAvecHoraire(date=friday.isoformat(), heure_min="23:00", heure_max="06:00"))
        dates_retour.append(DateAvecHoraire(date=sunday.isoformat(), heure_min="23:00", heure_max="06:00"))
    
    return dates_depart, dates_retour

def test_preset(preset_name: str):
    """Teste un preset et affiche les resultats"""
    print(f"\n{'='*60}")
    print(f"Test du preset: {preset_name}")
    print(f"{'='*60}")
    
    try:
        dates_depart, dates_retour = get_dates_from_preset(preset_name)
        
        print(f"\nDates de depart ({len(dates_depart)}):")
        for d in dates_depart:
            date_obj = date.fromisoformat(d.date)
            day_name = date_obj.strftime("%A")
            print(f"  - {d.date} ({day_name}) - {d.heure_min} a {d.heure_max}")
        
        print(f"\nDates de retour ({len(dates_retour)}):")
        for d in dates_retour:
            date_obj = date.fromisoformat(d.date)
            day_name = date_obj.strftime("%A")
            print(f"  - {d.date} ({day_name}) - {d.heure_min} a {d.heure_max}")
        
        # Verifications
        errors = []
        
        # Verifier que tous les departs sont le vendredi
        for d in dates_depart:
            date_obj = date.fromisoformat(d.date)
            if date_obj.weekday() != 4:  # 4 = vendredi
                errors.append(f"ERREUR: Le depart {d.date} n'est pas un vendredi (c'est un {date_obj.strftime('%A')})")
        
        # Verifier que tous les retours sont le dimanche
        for d in dates_retour:
            date_obj = date.fromisoformat(d.date)
            if date_obj.weekday() != 6:  # 6 = dimanche
                errors.append(f"ERREUR: Le retour {d.date} n'est pas un dimanche (c'est un {date_obj.strftime('%A')})")
        
        # Verifier qu'il y a au moins une date de depart et une de retour
        if len(dates_depart) == 0:
            errors.append("ERREUR: Aucune date de depart generee")
        if len(dates_retour) == 0:
            errors.append("ERREUR: Aucune date de retour generee")
        
        # Verifier qu'il n'y a qu'un seul depart et un seul retour
        if len(dates_depart) > 1:
            errors.append(f"ATTENTION: {len(dates_depart)} dates de depart generees (attendu: 1)")
        if len(dates_retour) > 1:
            errors.append(f"ATTENTION: {len(dates_retour)} dates de retour generees (attendu: 1)")
        
        if errors:
            print(f"\n{'!'*60}")
            print("PROBLEMES DETECTES:")
            for error in errors:
                print(f"  {error}")
            print(f"{'!'*60}")
            return False
        else:
            print(f"\nTous les tests sont passes pour {preset_name}!")
            return True
        
    except Exception as e:
        print(f"\nERREUR lors du test: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Fonction principale"""
    print("="*60)
    print("TEST DES PRESETS DE DATES")
    print("="*60)
    print(f"Date actuelle: {date.today()} ({date.today().strftime('%A')})")
    
    presets = ['weekend', 'next-weekend', 'next-week']
    
    results = {}
    for preset in presets:
        results[preset] = test_preset(preset)
    
    # Resume
    print(f"\n{'='*60}")
    print("RESUME DES TESTS")
    print(f"{'='*60}")
    for preset, success in results.items():
        status = "PASSE" if success else "ECHOUE"
        print(f"  {preset}: {status}")
    
    all_passed = all(results.values())
    if all_passed:
        print(f"\nTous les tests sont passes!")
    else:
        print(f"\nCertains tests ont echoue. Verifiez les erreurs ci-dessus.")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    exit(main())
