const q = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85`

export const LP = {
  heroPortrait: q('photo-1529626455594-4ff0802cfb7e', 900),
  heroThumb: q('photo-1600596542815-ffad4c1539a9', 400),
  experience: q('photo-1529156069898-49953e39b3ac', 900),
  mapWash: q('photo-1524661135-423995f22d0b', 1600),
  paris: q('photo-1502602898657-3e91760cbb34', 800),
  venice: q('photo-1523906834658-6e24ef2386f9', 800),
  barcelona: q('photo-1583422409516-2895a77efded', 800),
  rome: q('photo-1552832230-c0197dd311b5', 800),
  lisbon: q('photo-1555881403-64995e2242cc', 800),
  amsterdam: q('photo-1534351590666-13e3e96b5017', 800),
  sunsetTerrace: q('photo-1510414842594-a61c69b5ae57', 1400),
  friendsTrain: q('photo-1469854523086-cc02fe5d8800', 1200),
  nightCity: q('photo-1514565131-fce0801e5785', 1200),
  brunch: q('photo-1414235077428-338989a2e8c0', 1000),
  rooftop: q('photo-1476514525535-07fb3b4ae5f1', 1200),
  avatar1: q('photo-1494790108377-be9c29b29330', 200),
  avatar2: q('photo-1507003211169-0a1dd7228f2d', 200),
  avatar3: q('photo-1438761681033-6461ffad8d80', 200),
  avatar4: q('photo-1472099645785-5658abf4ff4e', 200),
  avatar5: q('photo-1544005313-94ddf0286df2', 200),
} as const

/** Scenes that make you project into the weekend */
export const DREAM_SCENES = [
  {
    photo: LP.sunsetTerrace,
    title: 'Vendredi 18h',
    line: 'Le vol est booké. Le groupe est chaud. Toi, tu souris déjà.',
  },
  {
    photo: LP.nightCity,
    title: 'Samedi soir',
    line: 'Une terrasse, une ville qui brille, zéro “on fait quoi ?”.',
  },
  {
    photo: LP.brunch,
    title: 'Dimanche midi',
    line: 'Brunch lent, rues calmes, retour soft — le Pop a tout prévu.',
  },
] as const

export const DESTINATIONS = [
  {
    slug: 'venise',
    label: 'Brume sur le Grand Canal',
    place: 'Venise',
    photo: LP.venice,
    tag: 'dès 340€',
    mood: '48h hors du temps',
  },
  {
    slug: 'paris',
    label: 'Lumières sur la Seine',
    place: 'Paris',
    photo: LP.paris,
    tag: 'dès 290€',
    mood: 'Le classique qui claque',
  },
  {
    slug: 'barcelone',
    label: 'Soleil & tapas jusqu’à tard',
    place: 'Barcelone',
    photo: LP.barcelona,
    tag: 'dès 310€',
    mood: 'Week-end qui réveille',
  },
  {
    slug: 'rome',
    label: 'Gelato au coucher du soleil',
    place: 'Rome',
    photo: LP.rome,
    tag: 'dès 280€',
    mood: 'Première fois magique',
  },
  {
    slug: 'lisbonne',
    label: 'Tram 28 & pastéis chauds',
    place: 'Lisbonne',
    photo: LP.lisbon,
    tag: 'dès 265€',
    mood: 'Lumière dorée',
  },
  {
    slug: 'amsterdam',
    label: 'Canaux au petit matin',
    place: 'Amsterdam',
    photo: LP.amsterdam,
    tag: 'dès 255€',
    mood: 'Vélo & liberté',
  },
] as const
