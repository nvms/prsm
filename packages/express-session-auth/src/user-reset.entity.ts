import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./user.entity.js";

@Entity("users_resets")
export class UserReset {
  @PrimaryGeneratedColumn("increment", { type: "int" })
  id: number;

  @OneToOne(() => User, { eager: true })
  @JoinColumn()
  user: User;

  @Column({ type: "varchar", length: 200 })
  @Index()
  token: string;

  @Column({ type: "datetime" })
  expires: Date;
}
