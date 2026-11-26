import type { ConnectionStatus } from '../sources/http/httpConnector';
import { Icon } from '../ui/primitives';

/** Explains why demo data is showing and how to connect a real workspace. */
export function ModeBanner({ status }: { status: ConnectionStatus }) {
  if (status.mode === 'error') {
    return (
      <div className="mode-banner mode-banner--error" role="status">
        <Icon name="alert" />
        <span>
          Couldn't connect to Notion — {status.error?.message} Showing demo data instead.
        </span>
      </div>
    );
  }
  return (
    <div className="mode-banner" role="status">
      <Icon name="info" />
      <span>
        Showing demo data. To import your own journal, set <code>NOTION_TOKEN</code> in <code>.env.local</code> and
        restart the dev server.
      </span>
    </div>
  );
}
