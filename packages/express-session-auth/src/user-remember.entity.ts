import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./user.entity.js";

@Entity("users_remembers")
export class UserRemember {
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
