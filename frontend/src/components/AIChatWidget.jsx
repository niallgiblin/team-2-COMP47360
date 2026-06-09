import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import StarIcon from '@mui/icons-material/Star';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { usePlan } from '../context/PlanContext';
import { useAuth } from '../hooks/useAuth';
import { chatAPI, locationAPI } from '../../services/apiService';
import './AIChatWidget.css';

const CHAT_MESSAGES_STORAGE_KEY = 'urban-gala-chat-messages';
const CHAT_OPEN_STORAGE_KEY = 'urban-gala-chat-open';
const MAX_DISPLAY_CITATIONS = 5;
const CHAT_CLEAR_CONFIRMATION = 'Chat history cleared. What vibe should we find next?';
const DEFAULT_MESSAGES = [
  { text: "Hello! How can I help you find the perfect vibe in Manhattan today?", sender: 'bot' }
];

const CLEAR_CHAT_REQUEST_PATTERNS = [
  /^(please\s+)?(clear|reset|delete|erase|wipe|forget)\s+(the\s+|this\s+|my\s+|our\s+|your\s+)?(chat|conversation|history|context|chat history|chat context|conversation history)(\s+(please|now))?[.!?]*$/i,
  /^(can|could|would)\s+you\s+(please\s+)?(clear|reset|delete|erase|wipe|forget)\s+(the\s+|this\s+|my\s+|our\s+|your\s+)?(chat|conversation|history|context|chat history|chat context|conversation history)[.!?]*$/i,
  /^(start over|new chat|fresh chat|forget what we talked about)[.!?]*$/i,
];

function isClearChatRequest(message) {
  const text = String(message || '').trim().replace(/\s+/g, ' ');
  if (!text) return false;

  // Negation guard: "do not clear chat" etc.
  if (/\b(do not|don't|dont|not)\b.*\b(clear|reset|delete|erase|wipe|forget)\b/i.test(text)) {
    return false;
  }

  // Embedded-noun guard: the chat-related noun must immediately follow
  // the verb + determiner group.  Rejects queries like
  // "please clear my doubts about the chat" — "doubts about the"
  // separates "clear" from "chat".
  const IMMEDIATE_NOUN_RE = /^(please\s+)?(can|could|would\s+you\s+(please\s+)?)?(clear|reset|delete|erase|wipe|forget)\s+(the\s+|this\s+|my\s+|our\s+|your\s+)?(chat|conversation|history|context|chat history|chat context|conversation history)/i;
  if (!IMMEDIATE_NOUN_RE.test(text)) {
    return false;
  }

  // Conjunction guard: if text contains a conjunction (and, but, or)
  // followed by content that is NOT chat-related, reject.
  if (/\band\s+(?!.*\b(chat|conversation|history|context)\b).{3,}$/i.test(text)) {
    return false;
  }

  return CLEAR_CHAT_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

function getChatStorageScope(user) {
  const userId = user?.id ?? user?.userId ?? user?.username;
  return userId ? `user:${userId}` : 'anonymous';
}

function getScopedStorageKey(baseKey, user) {
  return `${baseKey}:${getChatStorageScope(user)}`;
}

function loadStoredMessages(storageKey) {
  if (typeof window === 'undefined') return DEFAULT_MESSAGES;

  try {
    const stored = window.sessionStorage.getItem(storageKey);
    const parsed = stored ? JSON.parse(stored) : DEFAULT_MESSAGES;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_MESSAGES;
  } catch {
    return DEFAULT_MESSAGES;
  }
}

function loadStoredOpenState(storageKey) {
  if (typeof window === 'undefined') return false;

  try {
    return window.sessionStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

// Simple SVG icons for the widget
const ChatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="4" x2="12" y2="12"></line>
    <line x1="12" y1="4" x2="4" y2="12"></line>
  </svg>
);

const SendIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
);

const stripSourcesBlock = (text = '') => (
  text
    .replace(/\n?---\s*\n\*\*Sources:\*\*[\s\S]*$/i, '')
    .replace(/\n?---\s*\n(?:\[\d+\]\s+[^\n]+(?:\n|$))+$/i, '')
    .replace(/\s+---[\s\S]*$/i, '')
    .replace(/\*\*/g, '')
    .trim()
);

const stripInlineCitationMarkers = (text = '') => (
  text
    // Only strip [N] when preceded by a word char (letter or digit), not $ or :.
    .replace(/(?<=\w)\s*\[(\d+)\](?=\s|[.,!?;:]|$)/gu, '')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
);

const splitReadableParagraphs = (text = '') => {
  const cleaned = stripInlineCitationMarkers(stripSourcesBlock(text));
  if (!cleaned) return [];

  const explicitParagraphs = cleaned
    .split(/\n{2,}|\n(?=(?:[-*]|\d+\.)\s)/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (explicitParagraphs.length > 1) {
    return explicitParagraphs;
  }

  return cleaned
    .replace(/\s+-\s+/g, '\n- ')
    .split(/(?<=[.!?])\s+(?=(?:[A-Z]|\d+\.\s|[-*]\s))/)
    .map((part) => part.trim())
    .filter(Boolean);
};

const getReferencedCitationIndexes = (text = '', citationCount = 0) => {
  const matches = [...text.matchAll(/\[(\d+)\]/g)]
    .filter((match) => {
      const sentenceStart = Math.max(
        text.lastIndexOf('.', match.index - 1),
        text.lastIndexOf('\n', match.index - 1),
      );
      const sentenceEndCandidates = [
        text.indexOf('.', match.index + match[0].length),
        text.indexOf('\n', match.index + match[0].length),
      ].filter((index) => index >= 0);
      const sentenceEnd = sentenceEndCandidates.length
        ? Math.min(...sentenceEndCandidates)
        : text.length;
      const surroundingText = text
        .slice(sentenceStart + 1, sentenceEnd)
        .replace(/\[\d+\]/g, '')
        .trim();

      return surroundingText.length > 0;
    })
    .map((match) => Number(match[1]) - 1)
    .filter((index) => index >= 0 && index < citationCount);

  return [...new Set(matches)];
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for',
  'inc', 'llc', 'ltd',
]);

const normalizeCitationMatchText = (text = '') => (
  stripInlineCitationMarkers(stripSourcesBlock(text))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
);

const isCitationVenueNamed = (text = '', citation = {}) => {
  const visibleText = normalizeCitationMatchText(text);
  const venueName = normalizeCitationMatchText(citation.name || '');

  if (!venueName || !visibleText) return false;

  // Token-based overlap: split both into tokens, filter stop words,
  // and check if >= 50% of venue name tokens appear in visible text.
  const visibleTokens = new Set(visibleText.split(/\s+/).filter(Boolean));
  const nameTokens = venueName.split(/\s+/).filter(Boolean);

  const significantTokens = nameTokens.filter((t) => !STOP_WORDS.has(t));
  if (significantTokens.length === 0) return false;

  const matchedCount = significantTokens.filter((t) => visibleTokens.has(t)).length;
  return matchedCount / significantTokens.length > 0.5;
};

const getDisplayCitations = (text = '', citations = []) => {
  if (!citations.length) return [];

  const referencedIndexes = getReferencedCitationIndexes(stripSourcesBlock(text), citations.length);
  const namedIndexes = citations
    .map((citation, index) => (isCitationVenueNamed(text, citation) ? index : null))
    .filter((index) => index !== null);

  if (referencedIndexes.length > 0) {
    const displayIndexes = [
      ...referencedIndexes,
      ...namedIndexes.filter((index) => !referencedIndexes.includes(index)),
    ];

    return displayIndexes.slice(0, MAX_DISPLAY_CITATIONS).map((index) => ({
      citation: citations[index],
      displayIndex: index,
    }));
  }

  if (namedIndexes.length > 0) {
    return namedIndexes.slice(0, MAX_DISPLAY_CITATIONS).map((index) => ({
      citation: citations[index],
      displayIndex: index,
    }));
  }

  return citations.slice(0, MAX_DISPLAY_CITATIONS).map((_, index) => ({
    citation: citations[index],
    displayIndex: index,
  }));
};

const parseCitationRating = (rating) => {
  if (typeof rating === 'number' && Number.isFinite(rating)) return rating;
  if (typeof rating === 'string') {
    const match = rating.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (match) {
      const parsed = Number(match[1]);
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }
  return 0;
};

const normalizeCitationPrice = (price) => {
  if (typeof price === 'number' && Number.isFinite(price)) return price;
  if (typeof price !== 'string') return 0;

  const priceLevels = {
    'price level very cheap': 1,
    'price level cheap': 2,
    'price level moderate': 3,
    'price level expensive': 4,
    'price level very expensive': 5,
  };
  const normalizedPrice = price.trim().toLowerCase();
  return priceLevels[normalizedPrice] || 0;
};

const normalizeCitationVenue = (citation) => {
  const rating = parseCitationRating(citation.review ?? citation.rating);
  const price = normalizeCitationPrice(citation.price);
  const latitude = citation.latitude ?? citation.lat;
  const longitude = citation.longitude ?? citation.lng;

  return {
    id: citation.id ?? citation.venue_id,
    name: citation.name,
    address: citation.address,
    latitude,
    longitude,
    lat: latitude,
    lng: longitude,
    type: citation.type,
    price,
    rawPrice: citation.price,
    rating,
    review: rating,
    numReviews: citation.numReviews,
    isRestaurant: citation.isRestaurant,
    isBar: citation.isBar,
    isClub: citation.isClub,
    isLandmark: citation.isLandmark,
    zone: citation.zone,
    zoneId: citation.zoneId,
    tags: citation.tags,
    imageUrl: citation.imageUrl,
    uri: citation.uri || citation.url || citation.website,
    description: citation.description || citation.summary || citation.snippet,
    information: citation.information,
    summary: citation.summary,
  };
};

const exactNameMatch = (a = '', b = '') => (
  String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
);

const hydrateVenueFromCanonicalApi = async (venue) => {
  const fallbackVenue = normalizeCitationVenue(venue);
  const venueId = fallbackVenue.id ?? venue.venue_id;

  if (venueId !== null && venueId !== undefined && venueId !== '') {
    try {
      const details = await locationAPI.getLocationById(venueId);
      if (details?.location) {
        return normalizeCitationVenue({ ...fallbackVenue, ...details.location });
      }
    } catch (error) {
      console.warn("Failed to hydrate chat venue by id:", error);
    }
  }

  if (fallbackVenue.name) {
    try {
      const result = await locationAPI.searchLocations(fallbackVenue.name, 3);
      const matches = Array.isArray(result?.content) ? result.content : [];
      const exact = matches.find((candidate) => exactNameMatch(candidate.name, fallbackVenue.name));
      if (exact) {
        return normalizeCitationVenue({ ...fallbackVenue, ...exact });
      }
    } catch (error) {
      console.warn("Failed to hydrate chat venue by name:", error);
    }
  }

  return fallbackVenue;
};

const VenueCitationCard = ({ citation, displayIndex, onOpenVenue, isPending }) => {
  const venue = normalizeCitationVenue(citation);
  const rating = Number(venue.rating);
  const venueKey = String(venue.id ?? venue.name);
  const pending = isPending === venueKey;

  return (
    <div className="venue-citation-card">
      <button
        type="button"
        className="venue-citation-card-inner"
        onClick={() => onOpenVenue(venue)}
        disabled={pending}
        aria-label={`Add ${venue.name} to plan and view on map`}
      >
        <div className="venue-citation-main">
          <div className="venue-citation-name">{venue.name}</div>
          <div className="venue-citation-meta">
            {venue.zone && (
              <span>
                <LocationOnIcon fontSize="inherit" />
                {venue.zone}
              </span>
            )}
            {rating > 0 && (
              <span>
                <StarIcon fontSize="inherit" />
                {rating.toFixed(1)}
              </span>
            )}
          </div>
          {venue.address && <div className="venue-citation-address">{venue.address}</div>}
        </div>
        <div className="venue-citation-action-area" aria-hidden="true">
          <span className="venue-citation-action">
            Add to Plan
            {pending && <span className="venue-action-spinner" />}
          </span>
          <ArrowForwardIcon fontSize="small" />
        </div>
      </button>
    </div>
  );
};

const AIChatWidget = () => {
  const navigate = useNavigate();
  const { addToPlan, setSelectedVenue, setFromPlan } = usePlan();
  const auth = useAuth();
  const currentUser = auth?.user;
  const messagesStorageKey = getScopedStorageKey(CHAT_MESSAGES_STORAGE_KEY, currentUser);
  const openStorageKey = getScopedStorageKey(CHAT_OPEN_STORAGE_KEY, currentUser);
  const [isOpen, setIsOpen] = useState(() => loadStoredOpenState(openStorageKey));
  const [messages, setMessages] = useState(() => loadStoredMessages(messagesStorageKey));
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingVenueKey, setPendingVenueKey] = useState(null);
  const messagesEndRef = useRef(null);
  const launcherRef = useRef(null);
  const inputRef = useRef(null);
  const previousOpenRef = useRef(isOpen);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Transition-aware focus management
  useEffect(() => {
    if (isOpen && !previousOpenRef.current) {
      // User-triggered closed-to-open: focus the input
      inputRef.current?.focus();
    } else if (!isOpen && previousOpenRef.current) {
      // User-triggered open-to-closed: focus the launcher
      launcherRef.current?.focus();
    }
    previousOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    setMessages(loadStoredMessages(messagesStorageKey));
    setIsOpen(loadStoredOpenState(openStorageKey));
    setInput('');
    setIsLoading(false);

    if (typeof window === 'undefined') return;

    try {
      window.sessionStorage.removeItem(CHAT_MESSAGES_STORAGE_KEY);
      window.sessionStorage.removeItem(CHAT_OPEN_STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear legacy chat storage:", error);
    }
  }, [messagesStorageKey, openStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.sessionStorage.setItem(messagesStorageKey, JSON.stringify(messages));
    } catch (error) {
      console.error("Failed to persist chat messages:", error);
    }
  }, [messages, messagesStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.sessionStorage.setItem(openStorageKey, String(isOpen));
    } catch (error) {
      console.error("Failed to persist chat open state:", error);
    }
  }, [isOpen, openStorageKey]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    if (isClearChatRequest(trimmedInput)) {
      setMessages([{ text: CHAT_CLEAR_CONFIRMATION, sender: 'bot' }]);
      setInput('');
      setIsLoading(false);
      return;
    }

    const userMessage = { text: trimmedInput, sender: 'user' };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Try streaming first.
      await chatAPI.sendMessageStream(trimmedInput, messages, {
        onToken: (token) => {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last._streaming) {
              // Append token to existing streaming message.
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...last,
                text: last.text + token,
              };
              return updated;
            }
            // First token — create the streaming placeholder message.
            return [...prev, { text: token, sender: 'bot', citations: [], _streaming: true }];
          });
        },
        onDone: ({ content, citations }) => {
          setMessages(prev => {
            const updated = [...prev];
            // Replace the streaming message (or append if none).
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx]._streaming) {
              updated[lastIdx] = {
                text: content,
                sender: 'bot',
                citations: citations || [],
                _streaming: false,
              };
            } else {
              updated.push({
                text: content,
                sender: 'bot',
                citations: citations || [],
              });
            }
            return updated;
          });
          setIsLoading(false);
        },
        onError: async (errorMessage) => {
          console.warn('Streaming failed, falling back to non-streaming:', errorMessage);
          // Fall back to non-streaming API.
          try {
            const data = await chatAPI.sendMessage(trimmedInput, messages);
            setMessages(prev => {
              const updated = [...prev];
              // Remove any partial streaming message.
              if (updated.length > 0 && updated[updated.length - 1]._streaming) {
                updated.pop();
              }
              updated.push({
                text: data.response,
                sender: 'bot',
                citations: data.citations || [],
              });
              return updated;
            });
          } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
            setMessages(prev => {
              const updated = [...prev];
              if (updated.length > 0 && updated[updated.length - 1]._streaming) {
                updated.pop();
              }
              updated.push({
                text: "Sorry, I'm having trouble connecting. Please try again.",
                sender: 'bot',
              });
              return updated;
            });
          } finally {
            setIsLoading(false);
          }
        },
      });
    } catch (error) {
      console.error("Error in streaming setup:", error);
      // Complete failure — try non-streaming.
      try {
        const data = await chatAPI.sendMessage(trimmedInput, messages);
        setMessages(prev => [...prev, {
          text: data.response,
          sender: 'bot',
          citations: data.citations || [],
        }]);
      } catch (_fallbackError) {
        console.error('Non-streaming fallback also failed:', _fallbackError);
        setMessages(prev => [...prev, {
          text: "Sorry, I'm having trouble connecting. Please try again.",
          sender: 'bot',
        }]);
      }
      setIsLoading(false);
    }
  };

  const toggleChat = () => setIsOpen(!isOpen);

  const handleOpenVenue = async (venue) => {
    const key = String(venue.id ?? venue.name);
    if (pendingVenueKey === key) return;

    setPendingVenueKey(key);
    try {
      const hydratedVenue = await hydrateVenueFromCanonicalApi(venue);
      addToPlan?.(hydratedVenue);
      setSelectedVenue(hydratedVenue);
      setFromPlan(false);
      navigate("/map", { state: { selectedVenue: hydratedVenue } });
    } finally {
      setPendingVenueKey(null);
    }
  };

  const launcherLabel = isOpen ? 'Hide AI Concierge' : 'Open AI Concierge';

  return (
    <div className="chat-widget-container">
      <div
        className={`chat-window ${isOpen ? 'open' : ''}`}
        inert={isOpen ? undefined : true}
        aria-hidden={!isOpen}
      >
        <div className="chat-header">
          <div className="chat-header-content">
            <ChatIcon />
            <span className="chat-title">AI Concierge</span>
          </div>
          <button onClick={toggleChat} className="close-button" aria-label="Close AI Concierge">
            <CloseIcon />
          </button>
        </div>
        <div className="messages-container">
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.sender}-message`}>
              <div className="message-bubble">
                <div className="message-content">
                  <div className="message-text">
                    {msg._streaming ? (
                      <p className="streaming-text">
                        {stripInlineCitationMarkers(stripSourcesBlock(msg.text))}
                        <span className="streaming-cursor" aria-hidden="true">|</span>
                      </p>
                    ) : (
                      <>
                        {splitReadableParagraphs(msg.text).map((paragraph, paragraphIndex) => (
                          <p key={paragraphIndex}>{paragraph}</p>
                        ))}
                      </>
                    )}
                    {msg.sender === 'bot' && !msg._streaming && getDisplayCitations(msg.text, msg.citations).length > 0 && (
                      <div className="venue-citation-list">
                        {getDisplayCitations(msg.text, msg.citations)
                          .map(({ citation, displayIndex }) => (
                          <VenueCitationCard
                            key={citation.venue_id || citation.id || displayIndex}
                            citation={citation}
                            displayIndex={displayIndex}
                            onOpenVenue={handleOpenVenue}
                            isPending={pendingVenueKey}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {isLoading && !messages.some(m => m._streaming) && (
            <div className="message bot-message">
              <div className="message-bubble">
                <div className="typing-indicator" role="status">
                  <span className="sr-only">AI Concierge is thinking</span>
                  <div className="typing-dots" aria-hidden="true">
                    <div className="dot"></div>
                    <div className="dot"></div>
                    <div className="dot"></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className={`input-container${isLoading ? ' is-loading' : ''}`} aria-busy={isLoading || undefined}>
          <div className="input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="message-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  handleSend();
                }
              }}
              placeholder="Type a message..."
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              className="send-button"
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
      <button
        ref={launcherRef}
        onClick={toggleChat}
        className={`chat-toggle-button ${isOpen ? 'open' : ''}`}
        aria-label={launcherLabel}
      >
        <ChatIcon />
      </button>
    </div>
  );
};

export default AIChatWidget;
