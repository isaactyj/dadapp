import type { Preset } from '../types';

export const PRESETS: Preset[] = [
  {
    id: 'blended',
    name: 'Oil + Defense Core',
    description: 'A blended preset for oil, defense, and war-tech names.',
    symbols: [
      'PLTR', 'LMT', 'NOC', 'RTX', 'GD', 'LHX', 'BWXT', 'KTOS', 'AVAV', 'RKLB',
      'XOM', 'CVX', 'COP', 'EOG', 'OXY', 'SLB', 'HAL', 'BKR', 'PBR', 'SU',
    ],
  },
  {
    id: 'oil',
    name: 'Oil Majors',
    description: 'Large energy producers and oilfield services names.',
    symbols: [
      'XOM', 'CVX', 'COP', 'EOG', 'OXY', 'SLB', 'HAL', 'BKR', 'PBR', 'SU',
      'DVN', 'FANG', 'MPC', 'VLO', 'KMI',
    ],
  },
  {
    id: 'defense',
    name: 'Defense Primes',
    description: 'Traditional defense and aerospace names.',
    symbols: [
      'LMT', 'NOC', 'RTX', 'GD', 'LHX', 'BA', 'TXT', 'CW', 'BWXT', 'HEI', 'HII', 'LDOS',
    ],
  },
  {
    id: 'war-tech',
    name: 'War-Tech',
    description: 'Software, drones, intelligence, and space.',
    symbols: ['PLTR', 'KTOS', 'AVAV', 'RKLB', 'MRCY', 'PL', 'SATS', 'IRDM', 'TDY'],
  },
];

