/**
 * THE ERROR-CODE SEAM (i18n wave, 2026-11-19): stable machine names for the
 * API's error bodies. The wire's `error` field stays the byte-exact English
 * it has always been — the API is locale-independent — and `errorCode` (+
 * `errorParams` when a message interpolates) lets the CLIENT localize via
 * the `error` area of the catalogs. A code maps to exactly one catalog key;
 * the `satisfies` makes a code pointing at a missing key a compile error,
 * so the seam can never drift from the catalogs.
 *
 * Browser-safe: pure data, no IO, no next-intl — the client reads codes off
 * a response body and renders `t(ERROR_CODES[code])`.
 */

import { EN_MESSAGES } from "./i18n/messages/en.ts";

/** Every catalog key inside the `error` area ("error.invalidJsonBody"). */
export type ApiErrorKey = `error.${keyof typeof EN_MESSAGES.error & string}`;

/**
 * THE CODES — `<family>.<snake_reason>`. Families mirror the route
 * namespaces (chats, graph_import, side_chat, …); the same catalog key may
 * back several codes when two routes refuse for the same reason
 * ("Unknown chat" everywhere is `chats.unknown`).
 */
export const ERROR_CODES = {
	"body.invalid_json": "error.invalidJsonBody",
	"body.must_be_json": "error.bodyMustBeJson",
	"activity.abort_body_invalid": "error.abortBodyInvalid",
	"activity.abort_id_invalid": "error.abortIdInvalid",
	"artifact_ui.steer_message_not_found": "error.steerMessageNotFound",
	"artifact_ui.input_invalid": "error.artifactUiInputInvalid",
	"chats.unknown": "error.unknownChat",
	"chats.not_found": "error.notFound",
	"chats.mode_invalid": "error.deleteModeInvalid",
	"chats.title_invalid": "error.titleInvalid",
	"side_threads.unknown": "error.unknownSideThread",
	"side_threads.no_running_answer": "error.noRunningSideAnswer",
	"steer.unknown_chat": "error.steerUnknownChat",
	"steer.no_live_turn": "error.noLiveTurn",
	"steer.target_changed": "error.liveTargetChanged",
	"submission.target_changed": "error.submissionTargetChanged",
	"extraction.in_flight": "error.extractionInFlight",
	"extraction.body_invalid": "error.extractionBodyInvalid",
	"graph_import.unsafe_path": "error.importUnsafePath",
	"graph_import.invalid_paths": "error.importInvalidPaths",
	"graph_import.too_big": "error.importTooBig",
	"graph_import.no_files": "error.importNoFiles",
	"graph_import.body_too_large": "error.importBodyTooLarge",
	"graph_import.read_failed": "error.importReadFailed",
	"graph.invalid_json_body": "error.graphInvalidJsonBody",
	"sources.deletion_incomplete": "error.sourceDeletionIncomplete",
	"sources.read_failed": "error.sourceOrgReadFailed",
	"jobs.chat_id_invalid": "error.jobsChatIdInvalid",
	"jobs.chat_id_required": "error.jobsChatIdRequired",
	"keys.value_invalid": "error.keysValueInvalid",
	"prompts.text_invalid": "error.promptsTextInvalid",
	"prompts.segment_invalid": "error.promptsSegmentInvalid",
	"stt.no_api_key": "error.sttNoApiKey",
	"stt.grant_failed": "error.sttGrantFailed",
	"stt.grant_no_token": "error.sttGrantNoToken",
	"stt.unreachable": "error.sttUnreachable",
	"themes.name_invalid": "error.themeNameInvalid",
	"turns.already_running": "error.turnAlreadyRunning",
	"turns.start_failed": "error.turnStartFailed",
	"follow_up.deferred": "error.followUpDeferred",
	"follow_up.deferred_background_off": "error.followUpDeferredBackgroundOff",
	"problem.unavailable": "error.problemUnavailable",
	"question.unavailable": "error.questionUnavailable",
	"claude_code.same_origin_required": "error.claudeCodeSameOrigin",
	"claude_code.disabled": "error.claudeCodeDisabled",
	"side_chat.segment_required": "error.sideChatSegmentRequired",
	"side_chat.nothing_to_retry": "error.sideChatNothingToRetry",
	"side_chat.quote_sources_mismatch": "error.sideChatQuoteMismatch",
	"side_chat.quoted_source_missing": "error.sideChatQuotedSourceMissing",
	"side_chat.model_unavailable": "error.sideChatModelUnavailable",
	"side_chat.source_not_segment": "error.sideChatSourceNotSegment",
	"side_chat.context_exceeded": "error.sideChatContextExceeded",
	"side_chat.still_answering": "error.sideChatStillAnswering",
	"side_chat.unknown_conversation": "error.sideChatUnknownConversation",
} as const satisfies Record<string, ApiErrorKey>;

/** A stable error code as it appears on the wire. */
export type ApiErrorCode = keyof typeof ERROR_CODES;

/** Runtime guard for codes read off an untrusted response body. */
export function isApiErrorCode(value: unknown): value is ApiErrorCode {
	return typeof value === "string" && Object.hasOwn(ERROR_CODES, value);
}
