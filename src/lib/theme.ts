import { backend } from '@backend';

export type { ThemePreference } from './backend/types';

export const { getThemePreference, setThemePreference } = backend.profile;
