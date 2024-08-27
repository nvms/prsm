import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./user.entity.js";

@Entity("users_confirmations")
export class UserConfirmation {
  @PrimaryGeneratedColumn("increment", { type: "int" })
  id: number;

  // Eagerly load this so we don't have to do this everywhere:
  // relations: ["user"]
  @OneToOne(() => User, { eager: true })
  @JoinColumn()
  user: User;

  @Column({ type: "varchar", length: 200 })
  @Index()
  token: string;

  @Column({ type: "varchar", length: 200 })
  @Index()
  email: string;

  @Column({ type: "datetime" })
  expires: Date;
}
