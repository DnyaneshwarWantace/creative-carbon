import { Migration } from '@mikro-orm/migrations';

export class Migration20261008084108_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_lab_tests" add "test_point" text not null default 'outgoing';`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_lab_tests" drop column "test_point";`);
  }

}
