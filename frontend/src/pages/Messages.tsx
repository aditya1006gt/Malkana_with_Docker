import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { AppBar } from "../components/AppBar";
import { Sidebar } from "../components/SideBar";
import { io, Socket } from "socket.io-client";
import { Footer } from "../components/Footer";
import MessageInput from "../components/MessagesComponents/RightSideComponents/MessageInput";
import MessageList from "../components/MessagesComponents/RightSideComponents/MessageList";
import ChatHeader from "../components/MessagesComponents/RightSideComponents/ChatHeader";
import SearchBar from "../components/MessagesComponents/LeftSideComponents/SearchBar";
import Tabs from "../components/MessagesComponents/LeftSideComponents/Tabs";
import List from "../components/MessagesComponents/LeftSideComponents/List";
import { CONFIG } from '../config';

const API_URL = CONFIG.apiUrl || "http://localhost:3000/api/v1";
const SOCKET_URL = CONFIG.socketUrl || "http://localhost:3000";

interface User {
  id: string;
  firstname: string;
  lastname: string;
  username: string;
  profilepic: string | null;
}

interface Message {
  id: string;
  content: string | null;
  createdAt: string;
  senderId: string;
  sender: User;
  isRead: boolean;
}

interface Conversation {
  id: string;
  otherUser: User;
  lastMessage: {
    content: string;
    createdAt: string;
    senderId: string;
  } | null;
  unreadCount: number;
  lastMessageAt: string;
}

export default function Messages() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"chats" | "users">("chats");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get current user ID from localStorage
  useEffect(() => {
    const userId = localStorage.getItem("userId");
    console.log("Current User ID:", userId); // Debug log
    if (userId) {
      setCurrentUserId(userId);
    }
  }, []);

  // Initialize socket connection
  useEffect(() => {
    if (!currentUserId) return;

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    newSocket.on("connect", () => {
      console.log("✅ Connected to server");
      newSocket.emit("join", currentUserId);
    });

    newSocket.on("connect_error", (error) => {
      console.error("❌ Connection error:", error);
    });

    newSocket.on("disconnect", () => {
      console.log("⚠️ Disconnected from server");
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [currentUserId]);

  // Load initial data
  useEffect(() => {
    if (currentUserId) {
      fetchConversations();
      fetchAllUsers();
    }
  }, [currentUserId]);

  // Socket listeners for selected conversation
  useEffect(() => {
    if (!socket || !selectedConversation) return;

    socket.emit("join-conversation", selectedConversation.id);

    const handleNewMessage = (message: Message) => {
      console.log("📩 Received new message:", message);
      
      // Add message to the list (avoid duplicates)
      setMessages((prev) => {
        if (prev.some(m => m.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });
      
      scrollToBottom();

      // Update conversation list
      setConversations(prev => {
        const updated = prev.map(conv => {
          if (conv.id === selectedConversation.id) {
            return {
              ...conv,
              lastMessage: {
                id: message.id,
                content: message.content || "",
                createdAt: message.createdAt,
                senderId: message.senderId
              },
              lastMessageAt: message.createdAt
            };
          }
          return conv;
        });
        return updated.sort((a, b) =>
          new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
        );
      });
    };

    const handleMessageNotification = (data: { conversationId: string; message: Message }) => {
      console.log("🔔 Message notification:", data);
      
      // Update unread count if not in current conversation
      if (data.conversationId !== selectedConversation.id) {
        setConversations(prev =>
          prev.map(conv =>
            conv.id === data.conversationId
              ? { ...conv, unreadCount: conv.unreadCount + 1 }
              : conv
          )
        );
      }
    };

    const handleTyping = ({ userId, isTyping: typing }: { userId: string; isTyping: boolean }) => {
      if (userId !== currentUserId) {
        setIsTyping(typing);
      }
    };

    socket.on("new-message", handleNewMessage);
    socket.on("message-notification", handleMessageNotification);
    socket.on("user-typing", handleTyping);

    return () => {
      socket.emit("leave-conversation", selectedConversation.id);
      socket.off("new-message", handleNewMessage);
      socket.off("message-notification", handleMessageNotification);
      socket.off("user-typing", handleTyping);
    };
  }, [socket, selectedConversation, currentUserId]);

  // Always scroll when messages array changes
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API_URL}/message/getconversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConversations(res.data);
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
    }
  };

  const fetchAllUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API_URL}/user/allusers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAllUsers(res.data.users);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${API_URL}/message/conversations/${conversationId}/messages`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setMessages(res.data);
      
      // Mark messages as read
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  };

  const createOrGetConversation = async (receiverId: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${API_URL}/message/postconversations`,
        { receiverId },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const conv = res.data;

      const otherUser = conv.participantOne.id === currentUserId
        ? conv.participantTwo
        : conv.participantOne;

      const newConv: Conversation = {
        id: conv.id,
        lastMessageAt: conv.lastMessageAt || null,
        unreadCount: 0,
        otherUser,
        lastMessage: conv.lastMessage || null
      };

      const exists = conversations.find(c => c.id === conv.id);
      if (!exists) {
        setConversations(prev => [newConv, ...prev]);
      }

      setSelectedConversation(newConv);
      fetchMessages(conv.id);
      setActiveTab("chats");
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    const tempMessage = newMessage;
    setNewMessage(""); // Clear input immediately for better UX

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${API_URL}/message/messages`,
        {
          conversationId: selectedConversation.id,
          content: tempMessage,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const message = res.data;

      // Add message to UI
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some(m => m.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });

      // Emit socket events
      if (socket) {
        socket.emit("send-message", {
          conversationId: selectedConversation.id,
          message,
        });
      }

      // Update conversation list
      setConversations(prev => {
        const updated = prev.map(conv => {
          if (conv.id === selectedConversation.id) {
            return {
              ...conv,
              lastMessage: {
                id: message.id,
                content: message.content || "",
                createdAt: message.createdAt,
                senderId: message.senderId
              },
              lastMessageAt: message.createdAt
            };
          }
          return conv;
        });
        return updated.sort((a, b) =>
          new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
        );
      });

      scrollToBottom();
    } catch (error) {
      console.error("Failed to send message:", error);
      setNewMessage(tempMessage); // Restore message if failed
      alert("Failed to send message. Please try again.");
    }
  };

  const handleTyping = () => {
    if (!selectedConversation || !socket) return;

    socket.emit("typing", {
      conversationId: selectedConversation.id,
      userId: currentUserId,
      isTyping: true,
    });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", {
        conversationId: selectedConversation.id,
        userId: currentUserId,
        isTyping: false,
      });
    }, 1000);
  };

  const selectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setMessages([]); // Clear old messages immediately
    fetchMessages(conv.id);

    // Reset unread count
    setConversations(prev =>
      prev.map(c => (c.id === conv.id ? { ...c, unreadCount: 0 } : c))
    );
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return d.toLocaleDateString("en-US", { weekday: "short" });
    } else {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (query.length < 3) {
      if (activeTab === "users") {
        fetchAllUsers();
      }
      return;
    }

    if (activeTab === "users") {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get(`${API_URL}/user/search?query=${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAllUsers(res.data.users);
      } catch (error) {
        console.error("Search error:", error);
      }
    }
  };

  const filteredConversations = conversations.filter((conv) =>
    `${conv.otherUser.firstname} ${conv.otherUser.lastname}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  const filteredUsers = allUsers.filter((user) =>
    `${user.firstname} ${user.lastname}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppBar />
      
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden md:block w-64 border-r border-gray-100 bg-gray-50/50">
          <Sidebar />
        </aside>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Conversations/Users List */}
          <div className="w-96 bg-white border-r border-gray-200 flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <h1 className="text-2xl font-black text-gray-900 mb-4 uppercase tracking-tight">Internal Comms</h1>

              {/* Search Bar */}
              <SearchBar searchQuery={searchQuery} activeTab={activeTab} handleSearch={handleSearch} />

              {/* Tabs */}
              <div className="mt-4">
                <Tabs 
                  setActiveTab={setActiveTab} 
                  setSearchQuery={setSearchQuery} 
                  fetchConversations={fetchConversations} 
                  fetchAllUsers={fetchAllUsers} 
                  activeTab={activeTab} 
                />
              </div>
            </div>

            {/* List */}
            <List 
              activeTab={activeTab} 
              filteredConversations={filteredConversations} 
              selectConversation={selectConversation} 
              selectedConversation={selectedConversation} 
              formatTime={formatTime} 
              filteredUsers={filteredUsers} 
              createOrGetConversation={createOrGetConversation} 
              currentUserId={currentUserId} 
            />
          </div>

          {/* Right Panel - Chat Area */}
          <div className="flex-1 flex flex-col h-full bg-white">
            {selectedConversation ? (
              <>
                {/* Chat Header */}
                <ChatHeader 
                  firstname={selectedConversation.otherUser.firstname} 
                  lastname={selectedConversation.otherUser.lastname} 
                  profilepic={selectedConversation.otherUser.profilepic} 
                  isTyping={isTyping} 
                />

                {/* Messages */}
                <MessageList 
                  messages={messages} 
                  currentUserId={currentUserId} 
                  messagesEndRef={messagesEndRef} 
                  formatTime={formatTime} 
                />

                {/* Message Input */}
                <MessageInput 
                  newMessage={newMessage} 
                  setNewMessage={setNewMessage} 
                  sendMessage={sendMessage} 
                  handleTyping={handleTyping} 
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gray-50/30">
                <div className="text-center">
                  <div className="text-6xl mb-4">💬</div>
                  <h3 className="text-lg font-black text-gray-400 uppercase tracking-widest mb-2">
                    No Active Channel
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Select a conversation or start a new secure transmission
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}