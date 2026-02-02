import { MessageCircle, Users } from "lucide-react";

export default function Tabs({
  setActiveTab,
  setSearchQuery,
  fetchConversations,
  fetchAllUsers,
  activeTab
}: {
  setActiveTab: (value: React.SetStateAction<"chats" | "users">) => void;
  setSearchQuery: (value: React.SetStateAction<string>) => void;
  fetchConversations: () => Promise<void>;
  fetchAllUsers: () => Promise<void>;
  activeTab: "chats" | "users";
}) {
  return (
    <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
      <button
        onClick={() => { 
          setActiveTab("chats"); 
          setSearchQuery(""); 
          fetchConversations(); 
        }}
        className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
          activeTab === "chats" 
            ? "bg-white text-blue-600 shadow-sm" 
            : "text-gray-400 hover:text-gray-600"
        }`}
      >
        <MessageCircle className="w-3.5 h-3.5" />
        Recent
      </button>
      <button
        onClick={() => { 
          setActiveTab("users"); 
          setSearchQuery(""); 
          fetchAllUsers(); 
        }}
        className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
          activeTab === "users" 
            ? "bg-white text-blue-600 shadow-sm" 
            : "text-gray-400 hover:text-gray-600"
        }`}
      >
        <Users className="w-3.5 h-3.5" />
        Directory
      </button>
    </div>
  );
}