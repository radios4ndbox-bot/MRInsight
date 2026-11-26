// Zone anatomiche della mappa (MRI progress).
// Gli id coincidono con le parti di assets/models/corpo.bin e con il vincolo exams_zona_valida (migrazione 0002).

export const ZONE = [
  { id: 'neuro', nome: 'Neuro', esempio: 'RM encefalo' },
  { id: 'rachide', nome: 'Rachide', esempio: 'RM rachide lombare' },
  { id: 'spalla', nome: 'Spalla', esempio: 'RM spalla' },
  { id: 'gomito-polso', nome: 'Gomito, polso e mano', esempio: 'RM polso' },
  { id: 'cuore', nome: 'Cuore', esempio: 'RM cardiaca' },
  { id: 'fegato', nome: 'Fegato e vie biliari', esempio: 'RM fegato' },
  { id: 'pancreas', nome: 'Pancreas', esempio: 'RM pancreas' },
  { id: 'reni', nome: 'Reni', esempio: 'RM renale' },
  { id: 'pelvi', nome: 'Pelvi', esempio: 'RM prostata' },
  { id: 'anca', nome: 'Anca', esempio: 'RM anca' },
  { id: 'ginocchio', nome: 'Ginocchio', esempio: 'RM ginocchio' },
  { id: 'caviglia', nome: 'Caviglia e piede', esempio: 'RM caviglia' },
];

export const zonaDa = (id) => ZONE.find((z) => z.id === id) || null;
