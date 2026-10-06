import { waitForDb } from '../db/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('trigger-log');

/**
 * Insert one event-trigger row (the 提醒日志 / event_trigger_logs record).
 *
 * Returns `true` when the row was persisted, `false` when the write failed. The result
 * is deliberate: a swallowed INSERT used to be invisible, and `event_trigger_logs` is
 * exactly what the consecutive-failure counter (`trackConsecutiveFailure`) reads before
 * auto-disabling a broken account - so a dropped 'failed' row silently disables the
 * auto-disable path. Callers must surface a `false` result instead of ignoring it.
 *
 * It does NOT throw: the reminder itself has already been sent (or its failure already
 * handled) and must not be lost just because the audit row could not be written.
 *
 * `eventId` accepts NULL for dated reminder sources (expiry / inventory / maintenance /
 * document items, checkbox 165): their ids are not `events.id`, and `event_trigger_logs.event_id`
 * is FK-constrained to events(id) while remaining nullable - so a dated skip/failure row must
 * pass NULL instead of throwing a FK violation.
 */
export async function recordEventTrigger(
  eventId: number | null,
  userId: number,
  triggerType: string,
  triggerDate: string,
  status: string = 'success',
  errorMessage?: string,
  channelResults?: string,
  errorDetails?: { channel_type?: string; account_id?: number; details?: unknown },
): Promise<boolean> {
  try {
    // 错误信息等字符串可能来自外部通知服务的响应：
    // 使用字面量 SQL + 占位符绑定的直连方式，避免经过动态 SQL 封装
    const db = await waitForDb();
    await db.query(
      `INSERT INTO event_trigger_logs
       (event_id, user_id, trigger_type, trigger_date, status, error_message, channel_results, error_details, channel_type, account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        eventId,
        userId,
        triggerType,
        triggerDate,
        status,
        errorMessage || null,
        channelResults || null,
        errorDetails?.details ? JSON.stringify(errorDetails.details) : null,
        errorDetails?.channel_type || null,
        errorDetails?.account_id || null,
      ],
    );
    return true;
  } catch (error) {
    log.error({ err: error }, 'Failed to record event trigger log');
    return false;
  }
}
