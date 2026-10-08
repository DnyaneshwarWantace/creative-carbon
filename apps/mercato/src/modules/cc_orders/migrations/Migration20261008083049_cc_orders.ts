import { Migration } from '@mikro-orm/migrations';

export class Migration20261008083049_cc_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_stage_settings" add "default_user_id" uuid null, add "default_user_name" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_stage_settings" drop column "default_user_id", drop column "default_user_name";`);
  }

}
