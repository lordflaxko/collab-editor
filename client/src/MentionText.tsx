import { splitMentions } from './mentions'

function MentionText({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((segment, i) =>
        segment.isMention ? (
          <span key={i} className="mention">
            {segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  )
}

export default MentionText
