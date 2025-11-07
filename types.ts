export interface Chapter {
  title: string;
  content: string;
}

export enum ChapterStatus {
  IDLE,
  TRANSLATING,
  DONE,
  ERROR,
}

export interface ChapterStatusInfo {
  status: ChapterStatus;
  progress: number;
  error?: string;
}

export enum TermCategory {
  PROPER_NOUN = 'Danh từ riêng',
  PLACE_NAME = 'Tên địa danh',
}

export interface GlossaryTerm {
  id: string; 
  category: TermCategory;
  original: string;
  translation: string;
  notes: string;
}

export interface DetectedTerm {
  original: string;
  translation: string;
  context: string; // The original sentence where the term was found
  category: 'PROPER_NOUN' | 'PLACE_NAME';
}

export enum NotificationType {
  ERROR = 'error',
  NEW_TERMS = 'new_terms',
}

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
  read: boolean;
  relatedChapterTitle?: string;
  details?: {
    error?: string;
    terms?: DetectedTerm[];
  };
}