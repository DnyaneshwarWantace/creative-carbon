import { Migration } from '@mikro-orm/migrations';

export class Migration20260923074928_cc_departments extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_departments" add "role_id" uuid null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_departments" drop column "role_id";`);
  }

}
