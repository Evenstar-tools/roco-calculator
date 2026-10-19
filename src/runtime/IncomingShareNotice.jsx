import { formatShareError, getShareFeedback } from "./share-feedback.js";
import "./entry-notice.css";

export function IncomingShareNotice({ locale, loading, error, targetServer, onOpen, onCancel }) {
  const copy = getShareFeedback(locale);
  if (loading) return <p className="entry-share-notice" role="status">{copy.checking}</p>;
  if (!error && !targetServer) return null;
  return <section className="entry-share-notice" role="alert" aria-labelledby="entry-share-heading">
    <h2 id="entry-share-heading">{error ? copy.invalid : targetServer === "cn" ? copy.conflictCn : copy.conflictGlobal}</h2>
    <p>{error ? formatShareError(error, locale) : copy.conflictBody}</p>
    <div className="entry-share-notice__actions">
      {!error && <button type="button" onClick={onOpen}>{targetServer === "cn" ? copy.openCn : copy.openGlobal}</button>}
      <button type="button" onClick={onCancel}>{error ? copy.dismiss : copy.cancel}</button>
    </div>
  </section>;
}
