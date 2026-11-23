# Push V1 — WayPop (6 notifications)

**Aucune push prix** : vol sous budget + baisse de prix → **email Resend seulement**.

## Catalogue

### Groupe (`notif_group`)

| # | Titre · texte | Destinataire | Déclencheur | Deep link |
|---|---------------|--------------|-------------|-----------|
| 1 | **{Prénom} est partant** · « {ville}, {out} → {ret} : vous êtes {n}. » | Organisateur | Join / accept invite. Batch 1 h : « Léa et Tom sont partants » | Planner trip |
| 2 | **{Orga} t'invite à {ville}** · « Le programme est prêt, il manque ta réponse. » | Invité **avec** app (token) ; sinon **email** | Invitation envoyée | Invite + CTA partant |
| 3 | **Le groupe attend ta réponse** · « {ville} : {noms} sont partants. » | Invité sans réponse | **48 h** après invite, **1×** | Invite |
| 4 | **Dates fixées : {out} → {ret}** · « {Orga} a calé le week-end à {ville}. » | Tout le groupe | Orga fixe / change dates | Planner trip |

### Pops (`notif_pops`)

| # | Titre · texte | Destinataire | Déclencheur | Deep link |
|---|---------------|--------------|-------------|-----------|
| 5 | **On le planifie {samedi\|dimanche} ?** · « Tu as gardé {titre}. » | Qui a **gardé** (liked) le Pop | **3 j** après keep, pas encore au Planner ; **1× / Pop** ; envoi **mercredi ou jeudi** ; jour proposé = prochain samedi (ou dimanche si Pop « weekend-dimanche ») | Sheet Ajouter au Planner (jour prérempli) |
| 6 | **Ton Pop commence demain** · « Premier stop à {heure} : {lieu}. » | Membres voyage daté | **Veille** ~**19 h** Europe/Paris | Programme J1 + CTA Lancer |

## Règles d’envoi

1. **Max 1 push / jour / user** hors groupe (#5 et #6). Si conflit même jour → **#6 gagne**, #5 reporté.
2. **Push groupe (#1–4) toujours** (sauf opt-out `notif_group`), avec **batch** (#1).
3. **Pas de push** si l’user a ouvert l’app pour **ce trip / ce Pop** dans l’**heure** (`POST /api/push/presence`).
4. **Quiet hours 21 h–9 h** Europe/Paris : différer au matin. **Exception** : #6 vers **19 h**.
5. Deux réglages user : **Groupe** · **Pops et jour J** (défaut : on si token enregistré).

## Types payload (`data.type`)

```
group_member_joined | group_invite | group_invite_nudge
group_dates_set | pop_plan_nudge | pop_starts_tomorrow
```

## Hors V1 push (garder email / désactiver push)

- Digests occasions Expo
- Activités J-7 Expo
- Relaunch planner Expo  

→ `PUSH_V1_ONLY=1` (défaut) coupe ces envois push legacy.

## Infra

- Tokens : `push_tokens` + prefs `notif_group` / `notif_pops`
- Log / cooldown / batch : `push_send_log`
- Présence : `push_presence`
- Jobs cron Bearer `CRON_SECRET` : invite-nudge 48h, pop-plan (mer/jeu), pop-eve (19h)
