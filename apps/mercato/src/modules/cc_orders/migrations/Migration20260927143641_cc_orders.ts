import { Migration } from '@mikro-orm/migrations';

export class Migration20260927143641_cc_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_order_events" add "changes" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_order_events" drop column "changes";`);
  }

}
