import { create } from 'zustand';

/**
 * Phones: an open support ticket is a conversation, so the app chrome (balance
 * header, bottom tab bar) steps away. Support sets it while a ticket or the
 * new-ticket form is open; it resets when Support unmounts.
 */
interface ChatFocusState {
  chatFocus: boolean;
  setChatFocus: (focus: boolean) => void;
}

export const useChatFocus = create<ChatFocusState>((set) => ({
  chatFocus: false,
  setChatFocus: (chatFocus) => set({ chatFocus }),
}));
