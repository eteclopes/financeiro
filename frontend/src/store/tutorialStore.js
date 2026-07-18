import { create } from 'zustand';

export const useTutorialStore = create((set) => ({
  active: false,
  start: () => set({ active: true }),
  stop:  () => set({ active: false }),
}));
