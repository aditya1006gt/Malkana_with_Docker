interface User {
  id: string;
  firstname: string;
  lastname: string;
  username: string;
  profilepic: string | null;
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

export default function List({
  activeTab,
  filteredConversations,
  selectConversation,
  selectedConversation,
  formatTime,
  filteredUsers,
  createOrGetConversation,
  currentUserId
}: {
  activeTab: "chats" | "users";
  filteredConversations: Conversation[];
  selectConversation: (conv: Conversation) => void;
  selectedConversation: Conversation | null;
  formatTime: (dateString: string) => string;
  filteredUsers: User[];
  createOrGetConversation: (userId: string) => void;
  currentUserId: string;
}) {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      {activeTab === "chats" ? (
        filteredConversations.length > 0 ? (
          filteredConversations.map((conv: Conversation) => (
            <div
              key={conv.id}
              onClick={() => selectConversation(conv)}
              className={`p-4 border-b border-gray-50 cursor-pointer transition-all relative ${
                selectedConversation?.id === conv.id ? "bg-blue-50/50" : "hover:bg-gray-50"
              }`}
            >
              {selectedConversation?.id === conv.id && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />
              )}
              <div className="flex items-center gap-3">
                <img 
                  src={conv.otherUser.profilepic || "https://www.gravatar.com/avatar/0000000000000000000000000000000?d=mp&f=y"} 
                  alt={`${conv.otherUser.firstname} ${conv.otherUser.lastname}`}
                  className="w-12 h-12 rounded-2xl border border-gray-200 object-cover bg-gray-100" 
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-black uppercase text-gray-900 truncate tracking-tight">
                      {conv.otherUser.firstname} {conv.otherUser.lastname}
                    </h3>
                    {conv.lastMessage && (
                      <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">
                        {formatTime(conv.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 truncate font-bold opacity-70">
                    {conv.lastMessage?.senderId === currentUserId && "OUTGOING: "}
                    {conv.lastMessage?.content || "No transmission records"}
                  </p>
                </div>
                {conv.unreadCount > 0 && (
                  <div className="bg-blue-600 text-white text-[10px] font-black rounded-full min-w-[20px] h-5 flex items-center justify-center px-2">
                    {conv.unreadCount}
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center px-6">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No Conversations</p>
            <p className="text-[10px] text-gray-500 mt-1">Start a new chat from the Directory tab</p>
          </div>
        )
      ) : (
        filteredUsers.length > 0 ? (
          filteredUsers.map((user: User) => (
            <div
              key={user.id}
              onClick={() => createOrGetConversation(user.id)}
              className="p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition-all"
            >
              <img 
                src={user.profilepic || "https://www.gravatar.com/avatar/0000000000000000000000000000000?d=mp&f=y"} 
                alt={`${user.firstname} ${user.lastname}`}
                className="w-10 h-10 rounded-xl border border-gray-200 bg-gray-100 object-cover" 
              />
              <div className="flex-1">
                <h3 className="text-[11px] font-black uppercase text-gray-900 tracking-tight">
                  {user.firstname} {user.lastname}
                </h3>
                <p className="text-[9px] text-blue-600 font-black uppercase tracking-widest opacity-60">
                  @{user.username || "OFFICER"}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center px-6">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No Users Found</p>
            <p className="text-[10px] text-gray-500 mt-1">Try a different search term</p>
          </div>
        )
      )}
    </div>
  );
}