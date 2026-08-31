import * as Y from 'yjs'
import {
  addReply,
  findItemById,
  makeItemMap,
  toggleReaction,
  useThreadedArray,
  type Author,
  type ReplyData,
} from './threadHelpers'

export interface CommentThreadData extends ReplyData {
  resolved: boolean
  anchorFrom: unknown
  anchorTo: unknown
  replies: ReplyData[]
}

type ItemMap = Y.Map<unknown>

export function commentsKeyFor(fileId: string) {
  return `comments:${fileId}`
}

export function commentsArrayFor(ydoc: Y.Doc, fileId: string): Y.Array<ItemMap> {
  return ydoc.getArray(commentsKeyFor(fileId))
}

export function createThread(
  ydoc: Y.Doc,
  fileId: string,
  ytext: Y.Text,
  from: number,
  to: number,
  author: Author,
  text: string,
) {
  const thread = makeItemMap(author, text)
  thread.set('resolved', false)
  thread.set(
    'anchorFrom',
    Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(ytext, from)),
  )
  thread.set('anchorTo', Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(ytext, to)))
  thread.set('replies', new Y.Array())
  commentsArrayFor(ydoc, fileId).push([thread])
}

export function replyToThread(
  ydoc: Y.Doc,
  fileId: string,
  threadId: string,
  author: Author,
  text: string,
) {
  addReply(commentsArrayFor(ydoc, fileId), threadId, author, text)
}

export function toggleCommentReaction(
  ydoc: Y.Doc,
  fileId: string,
  itemId: string,
  emoji: string,
  username: string,
) {
  toggleReaction(commentsArrayFor(ydoc, fileId), itemId, emoji, username)
}

export function setThreadResolved(
  ydoc: Y.Doc,
  fileId: string,
  threadId: string,
  resolved: boolean,
) {
  const thread = findItemById(commentsArrayFor(ydoc, fileId), threadId)
  thread?.set('resolved', resolved)
}

export function useComments(ydoc: Y.Doc, fileId: string): CommentThreadData[] {
  return useThreadedArray<CommentThreadData>(commentsArrayFor(ydoc, fileId))
}

// Resolves a thread's stored relative position back to a live document
// index, following edits made since the comment was created. Returns null
// once the anchored text has been deleted entirely.
export function resolveAnchor(ytext: Y.Text, anchorJSON: unknown): number | null {
  const doc = ytext.doc
  if (!doc) return null
  const relPos = Y.createRelativePositionFromJSON(anchorJSON)
  const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, doc)
  if (!absPos || absPos.type !== ytext) return null
  return absPos.index
}
