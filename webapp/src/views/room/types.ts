import type {
  StudyParticipant as ApiStudyParticipant,
  RoomMessage as ApiRoomMessage,
  CheerNotification as ApiCheerNotification,
  TimerStatus,
} from "../../api/studyRoom";

export type StudyStatus =
  | TimerStatus
  | "focusing"
  | "break"
  | string;

export type StudyParticipant = ApiStudyParticipant;
export type RoomMessage = ApiRoomMessage;
export type CheerNotification = ApiCheerNotification;

export interface FloatingReaction {
  id: string;
  emoji: string;
  x?: number; // percentage (5 to 95)
  fromName?: string;
  userName?: string;
  toName?: string;
  participantId?: string;
  timestamp: number;
  senderId?: string;
  senderName?: string;
  recipientId?: string | null;
  message?: string;
}

export type AmbiancePreset =
  | "none"
  | "rain"
  | "white_noise"
  | "cafe"
  | "waves"
  | "binaural";
