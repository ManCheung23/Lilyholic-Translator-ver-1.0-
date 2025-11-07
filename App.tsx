import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Chapter, ChapterStatus, GlossaryTerm, ChapterStatusInfo, Notification, NotificationType } from './types';
import { geminiService } from './services/geminiService';
import { LandingPage } from './components/LandingPage';
import { ChapterList } from './components/ChapterList';
import { TranslationView } from './components/TranslationView';
import { SingleTranslationFlow } from './components/SingleTranslationFlow';
import { Loader } from './components/Loader';
import { TranslationSettingsModal } from './components/TranslationSettingsModal';
import { GlossaryManagerModal } from './components/GlossaryManagerModal';
import { KeyIcon } from './components/icons/KeyIcon';
import { v4 as uuidv4 } from 'uuid';
import { NotificationCenter } from './components/NotificationCenter';
import { NewTermsModal } from './components/NewTermsModal';
import { RetranslateOptionsModal } from './components/RetranslateOptionsModal';


enum AppState {
  Landing,
  PreTranslationSetup,
  Splitting,
  ChapterSelection,
  Translating, // When navigating from list to a single chapter view
  Translation,
  SingleTranslation, // New state for the single translation UI
  Error,
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.Landing);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [translation, setTranslation] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [translationCache, setTranslationCache] = useState<Map<string, string>>(new Map());
  const [chapterStatuses, setChapterStatuses] = useState<Map<string, ChapterStatusInfo>>(new Map());
  const [isTranslatingAll, setIsTranslatingAll] = useState<boolean>(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [storyContext, setStoryContext] = useState<string>('Hiện đại');
  const [worldContext, setWorldContext] = useState<string>('Bình thường');
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);
  const [isGlossaryOpen, setIsGlossaryOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  
  const [isApiKeyReady, setIsApiKeyReady] = useState(false);
  const [isCheckingApiKey, setIsCheckingApiKey] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [viewingTermsNotification, setViewingTermsNotification] = useState<Notification | null>(null);
  
  const [isRetranslateModalOpen, setIsRetranslateModalOpen] = useState(false);
  const [chapterToRetranslate, setChapterToRetranslate] = useState<Chapter | null>(null);


  // Refs to hold the latest state values to avoid stale closures in async functions.
  const chapterStatusesRef = useRef(chapterStatuses);
  useEffect(() => {
    chapterStatusesRef.current = chapterStatuses;
  }, [chapterStatuses]);

  const isTranslatingAllRef = useRef(isTranslatingAll);
  useEffect(() => {
    isTranslatingAllRef.current = isTranslatingAll;
  }, [isTranslatingAll]);


  useEffect(() => {
    setIsCheckingApiKey(true);
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setIsApiKeyReady(true);
    }
    setIsCheckingApiKey(false);
  }, []);

  const handleSaveApiKey = () => {
    if (!apiKeyInput.trim()) {
      alert("Vui lòng nhập API Key.");
      return;
    }
    localStorage.setItem('gemini_api_key', apiKeyInput.trim());
    setIsApiKeyReady(true);
    setApiKeyInput('');
  };

  const handleChapterSelect = useCallback((chapter: Chapter) => {
    setSelectedChapter(chapter);
    setTranslation(translationCache.get(chapter.title) || '');
    setAppState(AppState.Translation);
  }, [translationCache]);

  const addNotification = useCallback((notificationData: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
      const newNotification: Notification = {
          ...notificationData,
          id: uuidv4(),
          timestamp: Date.now(),
          read: false,
      };
      setNotifications(prev => [newNotification, ...prev]);
  }, []);

  const handleToggleNotifications = useCallback(() => {
      setIsNotificationCenterOpen(prev => !prev);
  }, []);

  const handleMarkOneAsRead = useCallback((id: string) => {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const handleClearNotifications = useCallback(() => {
      setNotifications([]);
  }, []);

  const handleNotificationClick = useCallback((notification: Notification) => {
      // Mark as read immediately
      setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n));

      if (notification.type === NotificationType.NEW_TERMS) {
          setViewingTermsNotification(notification);
          setIsNotificationCenterOpen(false); // Close notification center
      } else if (notification.relatedChapterTitle) {
          // Existing logic for error notifications
          const chapterToSelect = chapters.find(c => c.title === notification.relatedChapterTitle);
          if (chapterToSelect) {
              handleChapterSelect(chapterToSelect);
              setIsNotificationCenterOpen(false); // Close notification center
          }
      }
  }, [chapters, handleChapterSelect]);

  const handleSaveNewTerms = useCallback((newTerms: GlossaryTerm[]) => {
      let addedCount = 0;
      setGlossary(prevGlossary => {
          const updatedGlossary = [...prevGlossary];
          const existingOriginals = new Set(prevGlossary.map(t => t.original.trim().toLowerCase()));
          
          newTerms.forEach(newTerm => {
              if (!existingOriginals.has(newTerm.original.trim().toLowerCase())) {
                  updatedGlossary.push(newTerm);
                  existingOriginals.add(newTerm.original.trim().toLowerCase());
                  addedCount++;
              }
          });

          return updatedGlossary;
      });

      let message = '';
      if (addedCount > 0) {
          message += `Đã lưu ${addedCount} thuật ngữ mới vào danh sách.`;
      }
      const skippedCount = newTerms.length - addedCount;
      if (skippedCount > 0) {
          message += `\n${skippedCount} thuật ngữ đã tồn tại và được bỏ qua.`;
      }
      if (message) {
        alert(message.trim());
      }

      setViewingTermsNotification(null); // Close the modal
  }, []);
  
  const handleSwitchApiKey = () => {
    if (window.confirm("Bạn có chắc chắn muốn đổi API Key không? Các tiến trình dịch đang diễn ra sẽ bị dừng lại.")) {
      setIsTranslatingAll(false);

      setChapterStatuses(prev => {
        const newStatuses = new Map(prev);
        let changed = false;
        // FIX: Explicitly type `statusInfo` to resolve a type inference issue where it was being inferred as `unknown`.
        newStatuses.forEach((statusInfo: ChapterStatusInfo, title) => {
          if (statusInfo.status === ChapterStatus.TRANSLATING) {
            newStatuses.set(title, { status: ChapterStatus.ERROR, progress: statusInfo.progress, error: "Đã dừng do đổi API Key. Nhấn để thử lại với key mới." });
            changed = true;
          }
        });
        return changed ? newStatuses : prev;
      });
      
      localStorage.removeItem('gemini_api_key');
      setIsApiKeyReady(false);
    }
  };


  const translateChapterInBackground = useCallback(async (chapter: Chapter, storyCtx: string, worldCtx: string, currentGlossary: GlossaryTerm[], retranslateInstruction?: string) => {
    if (chapterStatusesRef.current.get(chapter.title)?.status === ChapterStatus.DONE && translationCache.has(chapter.title) && !retranslateInstruction) {
        return;
    }

    setChapterStatuses(prev => new Map(prev).set(chapter.title, { status: ChapterStatus.TRANSLATING, progress: 0 }));

    try {
      const stream = await geminiService.translateChapterStream(chapter.content, storyCtx, worldCtx, currentGlossary, retranslateInstruction);
      const originalParaCount = chapter.content.split('\n').length || 1;
      let fullText = '';
      let jsonBuffer = '';
      let jsonStarted = false;
      const separator = '---JSON_TERMS---';

      for await (const chunk of stream) {
        const statusCheck = chapterStatusesRef.current.get(chapter.title)?.status;
        if (statusCheck !== ChapterStatus.TRANSLATING) {
          return;
        }

        const currentStreamText = fullText + chunk.text;
        
        if (jsonStarted) {
            jsonBuffer += chunk.text;
        } else if (currentStreamText.includes(separator)) {
            jsonStarted = true;
            const parts = currentStreamText.split(separator);
            fullText = parts[0];
            jsonBuffer = parts[1] || '';
        } else {
            fullText += chunk.text;
        }
        
        if (selectedChapter?.title === chapter.title) {
            setTranslation(fullText);
        }
        
        setTranslationCache(prevCache => new Map(prevCache).set(chapter.title, fullText));

        const translatedParaCount = fullText.split('\n').length;
        const progress = Math.min(99, Math.round((translatedParaCount / originalParaCount) * 100)); // Stop at 99% until JSON is parsed
        setChapterStatuses(prev => new Map(prev).set(chapter.title, { status: ChapterStatus.TRANSLATING, progress }));
      }
      
      if (jsonBuffer) {
        try {
            const newTerms = JSON.parse(jsonBuffer);
            if (Array.isArray(newTerms) && newTerms.length > 0) {
               addNotification({
                  type: NotificationType.NEW_TERMS,
                  message: `Phát hiện ${newTerms.length} thuật ngữ mới trong chương "${chapter.title}".`,
                  relatedChapterTitle: chapter.title,
                  details: { terms: newTerms }
              });
            }
        } catch(e) {
            console.error("Failed to parse detected terms JSON", e);
            console.log("JSON Buffer content:", jsonBuffer);
        }
      }

      if (chapterStatusesRef.current.get(chapter.title)?.status === ChapterStatus.TRANSLATING) {
        setChapterStatuses(prev => new Map(prev).set(chapter.title, { status: ChapterStatus.DONE, progress: 100 }));
      }
    } catch (e: any) {
      console.error(`Error translating chapter ${chapter.title}:`, e);
      const errorMessage = e.message || "Đã xảy ra lỗi không xác định.";

      addNotification({
          type: NotificationType.ERROR,
          message: `Lỗi dịch chương "${chapter.title}".`,
          relatedChapterTitle: chapter.title,
          details: { error: errorMessage }
      });
      
      if (errorMessage.toLowerCase().includes('api key') || errorMessage.includes('requested entity was not found')) {
          localStorage.removeItem('gemini_api_key');
          setIsApiKeyReady(false);
          setChapterStatuses(prev => new Map(prev).set(chapter.title, { 
              status: ChapterStatus.ERROR, 
              progress: 0, 
              error: "API Key không hợp lệ hoặc đã hết hạn. Vui lòng nhập lại." 
          }));
          return;
      }

      if (chapterStatusesRef.current.get(chapter.title)?.status === ChapterStatus.TRANSLATING) {
        setChapterStatuses(prev => new Map(prev).set(chapter.title, { status: ChapterStatus.ERROR, progress: 0, error: errorMessage }));
      }
    }
  }, [selectedChapter, translationCache, addNotification]);
  
  const handleTranslateChapter = useCallback((chapter: Chapter) => {
    const statusInfo = chapterStatuses.get(chapter.title);
    if (statusInfo?.status === ChapterStatus.DONE) {
      // This chapter is already translated, so open retranslate options
      setChapterToRetranslate(chapter);
      setIsRetranslateModalOpen(true);
    } else {
      // This is a new translation or a retry, start immediately
      translateChapterInBackground(chapter, storyContext, worldContext, glossary);
    }
  }, [chapterStatuses, storyContext, worldContext, glossary, translateChapterInBackground]);


  const handleTranslateAll = useCallback(async (chaptersToProcess: Chapter[]) => {
    setIsTranslatingAll(true);
    
    if (chaptersToProcess.length === 0) {
        alert("Không có chương nào hợp lệ để dịch.");
        setIsTranslatingAll(false);
        return;
    }

    const confirmMessage = `Bạn có chắc muốn dịch ${chaptersToProcess.length} chương không?`;

    if (window.confirm(confirmMessage)) {
      // Sort chapters to process based on their original order in the main `chapters` array
      const sortedChaptersToProcess = [...chaptersToProcess].sort(
        (a, b) => chapters.findIndex(c => c.title === a.title) - chapters.findIndex(c => c.title === b.title)
      );

      for (const chapter of sortedChaptersToProcess) {
        if (!isTranslatingAllRef.current) break;
        await translateChapterInBackground(chapter, storyContext, worldContext, glossary);
      }
    }
    setIsTranslatingAll(false);
  }, [chapters, translateChapterInBackground, storyContext, worldContext, glossary]);
  
  const handleTranslateSelected = useCallback((titles: Set<string>) => {
    const selectedAndUntranslated = chapters.filter(ch => {
        const isSelected = titles.has(ch.title);
        if (!isSelected) return false;
        const status = chapterStatuses.get(ch.title)?.status;
        return status === ChapterStatus.IDLE || status === ChapterStatus.ERROR;
    });

    if (selectedAndUntranslated.length > 0) {
      handleTranslateAll(selectedAndUntranslated);
    } else {
      alert("Các chương đã chọn đều đã được dịch hoặc đang trong quá trình dịch.");
    }
}, [chapters, chapterStatuses, handleTranslateAll]);


  const handleCancelTranslation = useCallback((chapter: Chapter) => {
      if (selectedChapter?.title === chapter.title) {
          setTranslation('');
      }
      setChapterStatuses(prev => new Map(prev).set(chapter.title, {
          status: ChapterStatus.IDLE,
          progress: 0,
      }));
      setTranslationCache(prev => {
          const newCache = new Map(prev);
          newCache.delete(chapter.title);
          return newCache;
      });
  }, [selectedChapter]);

  const handleDeleteChapter = useCallback((chapterToDelete: Chapter) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa chương "${chapterToDelete.title}" không? Hành động này sẽ xóa cả bản dịch (nếu có) và không thể hoàn tác.`)) {
      setChapters(prev => prev.filter(ch => ch.title !== chapterToDelete.title));

      setChapterStatuses(prev => {
        const newStatuses = new Map(prev);
        newStatuses.delete(chapterToDelete.title);
        return newStatuses;
      });

      setTranslationCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(chapterToDelete.title);
        return newCache;
      });
    }
  }, []);


  const handleFileForCustomMode = useCallback(async (file: File) => {
    setPendingFile(file);
    setFileName(file.name);
    setAppState(AppState.PreTranslationSetup);
    setIsSettingsModalOpen(true);
  }, []);

  const handleSettingsSubmit = useCallback(async (data: { context: string; world: string }) => {
    setStoryContext(data.context);
    setWorldContext(data.world);
    setIsSettingsModalOpen(false);

    // If this was the initial setup, proceed to splitting chapters
    if (appState === AppState.PreTranslationSetup && pendingFile) {
        setAppState(AppState.Splitting);
        try {
          const content = await pendingFile.text();
          const splitChapters = await geminiService.splitChapters(content);
          if (splitChapters && splitChapters.length > 0) {
            setChapters(splitChapters);
            const initialStatuses = new Map<string, ChapterStatusInfo>();
            splitChapters.forEach(ch => {
              initialStatuses.set(ch.title, { status: ChapterStatus.IDLE, progress: 0 });
            });
            setChapterStatuses(initialStatuses);
            setAppState(AppState.ChapterSelection);
          } else {
            throw new Error("Không tìm thấy chương nào trong tệp.");
          }
        } catch (e: any) {
          setError(e.message || "Đã xảy ra lỗi không xác định.");
          setAppState(AppState.Error);
        } finally {
          setPendingFile(null); // Clear the pending file
        }
    }
  }, [pendingFile, appState]);

  const handleStartSingleTranslation = () => {
    setAppState(AppState.SingleTranslation);
  };
  
  const handleRetranslateChapter = useCallback(() => {
    if (selectedChapter) {
      setChapterToRetranslate(selectedChapter);
      setIsRetranslateModalOpen(true);
    }
  }, [selectedChapter]);

  const handleRetranslateConfirm = useCallback(async ({ reason, customText }: { reason: string, customText: string }) => {
    if (!chapterToRetranslate) return;

    let retranslateInstruction = '';
    switch (reason) {
        case 'inaccurate':
            retranslateInstruction = 'Người dùng đã báo cáo bản dịch trước đó không chính xác. Hãy đặc biệt chú ý đến việc dịch đúng từng câu, giữ nguyên ý nghĩa và bối cảnh. Tuyệt đối không thêm vào những nội dung không có trong văn bản gốc.';
            break;
        case 'other':
            retranslateInstruction = customText;
            break;
        // 'update_glossary' needs no special instruction, it's the default behavior.
    }

    setIsRetranslateModalOpen(false);
    
    // If the re-translated chapter is the currently selected one, clear its view
    if (selectedChapter?.title === chapterToRetranslate.title) {
        setTranslation('');
    }
    
    setChapterStatuses(prev =>
        new Map(prev).set(chapterToRetranslate.title, { status: ChapterStatus.TRANSLATING, progress: 0 })
    );
    setTranslationCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(chapterToRetranslate.title);
        return newCache;
    });
    
    await translateChapterInBackground(chapterToRetranslate, storyContext, worldContext, glossary, retranslateInstruction);
    
    setChapterToRetranslate(null);

  }, [chapterToRetranslate, selectedChapter, storyContext, worldContext, glossary, translateChapterInBackground]);
  
  const handleTranslateRemaining = useCallback(async () => {
    const remainingChapters = chapters.filter(
      ch => chapterStatuses.get(ch.title)?.status === ChapterStatus.IDLE || chapterStatuses.get(ch.title)?.status === ChapterStatus.ERROR
    );
    handleTranslateAll(remainingChapters);
  }, [chapters, chapterStatuses, handleTranslateAll]);

  const handleTranslationUpdate = useCallback((newTranslation: string) => {
      setTranslation(newTranslation);
      if (selectedChapter) {
        setTranslationCache(prev => new Map(prev).set(selectedChapter.title, newTranslation));
      }
  }, [selectedChapter]);

  const handleBackToChapters = () => {
    setSelectedChapter(null);
    setTranslation('');
    setAppState(AppState.ChapterSelection);
  };

  const handleReset = () => {
    setAppState(AppState.Landing);
    setChapters([]);
    setSelectedChapter(null);
    setTranslation('');
    setError('');
    setFileName('');
    setTranslationCache(new Map());
    setChapterStatuses(new Map());
    setIsTranslatingAll(false);
    setPendingFile(null);
    setStoryContext('Hiện đại');
    setWorldContext('Bình thường');
    setGlossary([]);
    setNotifications([]);
    setIsNotificationCenterOpen(false);
    setIsSettingsModalOpen(false);
  };
  
  const handleGlossarySave = (updatedGlossary: GlossaryTerm[]) => {
    setGlossary(updatedGlossary);
    setIsGlossaryOpen(false);
  }

  const handleSettingsModalClose = () => {
    if(appState === AppState.PreTranslationSetup) {
      handleReset();
    } else {
      setIsSettingsModalOpen(false);
    }
  }
  
  const unreadNotificationCount = notifications.filter(n => !n.read).length;

  const renderContent = () => {
    if (isCheckingApiKey) {
      return <Loader message="Đang kiểm tra cấu hình..." />;
    }

    if (!isApiKeyReady) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">Chào mừng!</h1>
          <p className="text-lg md:text-xl text-text-muted mb-8">Để sử dụng công cụ dịch thuật này, bạn cần cung cấp API Key của Google AI Studio.</p>
          
          <div className="w-full max-w-md">
            <div className="relative">
              <KeyIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted" />
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveApiKey(); }}
                placeholder="Dán API Key của bạn vào đây"
                className="w-full bg-surface p-3 pl-10 rounded-lg border border-primary/30 focus:ring-primary focus:border-primary text-text-main"
              />
            </div>
            <button
              onClick={handleSaveApiKey}
              className="mt-4 w-full bg-primary text-bkg font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-primary-focus transition-all duration-300 flex items-center justify-center"
            >
              Lưu và Tiếp tục
            </button>
          </div>

          <p className="text-xs text-text-muted mt-6">
            Bạn có thể lấy API Key từ <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google AI Studio</a>.
            Việc sử dụng Google Gemini API có thể phát sinh chi phí.
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">
              Tìm hiểu thêm về giá cước.
            </a>
          </p>
        </div>
      );
    }

    switch (appState) {
      case AppState.Landing:
        return <LandingPage 
          onFileSelectForCustom={handleFileForCustomMode} 
          onStartSingleTranslation={handleStartSingleTranslation}
          disabled={appState !== AppState.Landing} 
          onSwitchApiKey={handleSwitchApiKey}
          unreadNotificationCount={unreadNotificationCount}
          onToggleNotifications={handleToggleNotifications}
        />;
      case AppState.PreTranslationSetup:
        return (
          <>
            <LandingPage 
              onFileSelectForCustom={handleFileForCustomMode} 
              onStartSingleTranslation={handleStartSingleTranslation}
              disabled={true} 
              onSwitchApiKey={handleSwitchApiKey}
              unreadNotificationCount={unreadNotificationCount}
              onToggleNotifications={handleToggleNotifications}
            />
            <TranslationSettingsModal 
              isOpen={isSettingsModalOpen}
              onClose={handleSettingsModalClose}
              onSubmit={handleSettingsSubmit}
              initialContext={storyContext}
              initialWorld={worldContext}
              isInitialSetup={true}
            />
          </>
        );
      case AppState.Splitting:
        return <Loader message="Đang phân tích và tách chương..." />;
      case AppState.ChapterSelection:
        return (
          <>
            <ChapterList 
              chapters={chapters} 
              onSelectChapter={handleChapterSelect} 
              fileName={fileName} 
              chapterStatuses={chapterStatuses}
              translationCache={translationCache}
              onTranslateAll={handleTranslateRemaining}
              onTranslateSelected={handleTranslateSelected}
              isTranslatingAll={isTranslatingAll}
              onOpenGlossary={() => setIsGlossaryOpen(true)}
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onTranslateChapter={handleTranslateChapter}
              onCancelTranslation={handleCancelTranslation}
              onDeleteChapter={handleDeleteChapter}
              onSwitchApiKey={handleSwitchApiKey}
              onBack={handleReset}
              unreadNotificationCount={unreadNotificationCount}
              onToggleNotifications={handleToggleNotifications}
            />
             <TranslationSettingsModal 
              isOpen={isSettingsModalOpen}
              onClose={handleSettingsModalClose}
              onSubmit={handleSettingsSubmit}
              initialContext={storyContext}
              initialWorld={worldContext}
            />
            <GlossaryManagerModal
              isOpen={isGlossaryOpen}
              onClose={() => setIsGlossaryOpen(false)}
              glossary={glossary}
              onSave={handleGlossarySave}
            />
          </>
        );
      case AppState.Translating:
      case AppState.Translation:
        if (selectedChapter) {
          return (
            <>
              <TranslationView 
                chapter={selectedChapter} 
                translation={translation} 
                onBack={handleBackToChapters} 
                onRetranslateChapter={handleRetranslateChapter}
                onTranslationUpdate={handleTranslationUpdate}
                storyContext={storyContext}
                worldContext={worldContext}
                glossary={glossary}
                onOpenGlossary={() => setIsGlossaryOpen(true)}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onSwitchApiKey={handleSwitchApiKey}
                chapterStatus={chapterStatuses.get(selectedChapter.title)}
                unreadNotificationCount={unreadNotificationCount}
                onToggleNotifications={handleToggleNotifications}
              />
              <TranslationSettingsModal 
                isOpen={isSettingsModalOpen}
                onClose={handleSettingsModalClose}
                onSubmit={handleSettingsSubmit}
                initialContext={storyContext}
                initialWorld={worldContext}
              />
              <GlossaryManagerModal
                isOpen={isGlossaryOpen}
                onClose={() => setIsGlossaryOpen(false)}
                glossary={glossary}
                onSave={handleGlossarySave}
              />
            </>
          );
        }
        return <Loader message="Đang tải chương..." />;
      case AppState.SingleTranslation:
        return <SingleTranslationFlow 
          onBack={handleReset} 
          onSwitchApiKey={handleSwitchApiKey} 
          unreadNotificationCount={unreadNotificationCount}
          onToggleNotifications={handleToggleNotifications}
        />;
      case AppState.Error:
        return (
          <div className="text-center p-8">
            <h2 className="text-2xl text-red-400 mb-4">Đã xảy ra lỗi</h2>
            <p className="text-text-muted mb-6">{error}</p>
            <button onClick={handleReset} className="bg-primary text-bkg font-bold py-2 px-6 rounded-lg hover:bg-primary-focus">
              Thử lại
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center">
      {renderContent()}
      <NotificationCenter 
        isOpen={isNotificationCenterOpen}
        notifications={notifications}
        onClose={() => setIsNotificationCenterOpen(false)}
        onClearAll={handleClearNotifications}
        onNotificationClick={handleNotificationClick}
        onMarkOneAsRead={handleMarkOneAsRead}
      />
      <NewTermsModal
        isOpen={!!viewingTermsNotification}
        onClose={() => setViewingTermsNotification(null)}
        notification={viewingTermsNotification}
        onSave={handleSaveNewTerms}
      />
      <RetranslateOptionsModal
        isOpen={isRetranslateModalOpen}
        onClose={() => {
            setIsRetranslateModalOpen(false);
            setChapterToRetranslate(null);
        }}
        onSubmit={handleRetranslateConfirm}
      />
    </main>
  );
};

export default App;