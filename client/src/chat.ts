import * as Y from 'yjs'
import {
  addReply,
  makeItemMap,
  toggleReaction,
  useThreadedArray,
  type Author,
  type ReplyData,
} from './threadHelpers'

export interface ChatMessageData extends ReplyData {
  replies: ReplyData[]
}

type ItemMap = Y.Map<unknown>

export function chatArrayFor(ydoc: Y.Doc): Y.Array<ItemMap> {
  return ydoc.getArray('chat')
}

export function sendMessage(ydoc: Y.Doc, author: Author, text: string) {
  const message = makeItemMap(author, text)
  message.set('replies', new Y.Array())
  chatArrayFor(ydoc).push([message])
}

export function replyToMessage(ydoc: Y.Doc, messageId: string, author: Author, text: string) {
  addReply(chatArrayFor(ydoc), messageId, author, text)
}

export function toggleChatReaction(ydoc: Y.Doc, itemId: string, emoji: string, username: string) {
  toggleReaction(chatArrayFor(ydoc), itemId, emoji, username)
}

export function useChat(ydoc: Y.Doc): ChatMessageData[] {
  return useThreadedArray<ChatMessageData>(chatArrayFor(ydoc))
}
