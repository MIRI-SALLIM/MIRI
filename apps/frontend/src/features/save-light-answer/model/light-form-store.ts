import { create } from "zustand";

import type { LightAnswerValue, LightInputResponse } from "@/entities/light-answer";

export type LightFormSaveStatus = "idle" | "saving" | "saved" | "error";

interface LightFormState {
  answers: LightAnswerValue[];
  currentStep: number;
  guesses: LightAnswerValue[];
  isHydrated: boolean;
  isReadOnly: boolean;
  saveStatus: LightFormSaveStatus;
  hydrate: (input: LightInputResponse) => void;
  setAnswer: (index: number, value: LightAnswerValue) => void;
  setCurrentStep: (step: number) => void;
  setGuess: (index: number, value: LightAnswerValue) => void;
  setReadOnly: (readOnly: boolean) => void;
  setSaveStatus: (status: LightFormSaveStatus) => void;
}

export const useLightFormStore = create<LightFormState>((set) => ({
  answers: [],
  currentStep: 0,
  guesses: [],
  isHydrated: false,
  isReadOnly: false,
  saveStatus: "idle",
  hydrate: (input) =>
    set({
      answers: input.answers ? [...input.answers] : [],
      guesses: input.guesses ? [...input.guesses] : [],
      isHydrated: true,
      isReadOnly: false,
      saveStatus: "idle",
    }),
  setAnswer: (index, value) =>
    set((state) => {
      const answers = [...state.answers];
      answers[index] = value;
      return { answers, saveStatus: "saving" };
    }),
  setCurrentStep: (step) => set({ currentStep: step }),
  setGuess: (index, value) =>
    set((state) => {
      const guesses = [...state.guesses];
      guesses[index] = value;
      return { guesses, saveStatus: "saving" };
    }),
  setReadOnly: (isReadOnly) => set({ isReadOnly }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
}));
