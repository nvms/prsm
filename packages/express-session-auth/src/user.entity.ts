import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export const AuthStatus = {
  Normal: 0,
  Archived: 1,
  Banned: 2,
  Locked: 3,
  PendingReview: 4,
  Suspended: 5,
} as const;

export const AuthRole = {
  Admin: 1,
  Author: 2,
  Collaborator: 4,
  Consultant: 8,
  Consumer: 16,
  Contributor: 32,
  Coordinator: 64,
  Creator: 128,
  Developer: 256,
  Director: 512,
  Editor: 1024,
  Employee: 2048,
  Maintainer: 4096,
  Manager: 8192,
  Moderator: 16384,
  Publisher: 32768,
  Reviewer: 65536,
  Subscriber: 131072,
  SuperAdmin: 262144,
  SuperEditor: 524288,
  SuperModerator: 1048576,
  Translator: 2097152,
  // XX: 4194304,
  // XX: 8388608,
  // XX: 16777216,
  // XX: 33554432,
  // XX: 67108864,
  // XX: 134217728,
  // XX: 268435456,
  // XX: 536870912,
} as const;

const createMapFromEnum = (enumObj: Record<string, number>) => {
  return Object.fromEntries(
    Object.entries(enumObj).map(([key, value]) => [value, key]),
  );
};

export const getStatusMap = () => createMapFromEnum(AuthStatus);
export const getRoleMap = () => createMapFromEnum(AuthRole);

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("increment", { type: "int" })
  id: number;

  @Column({ type: "varchar", length: 50, nullable: true })
  @Index()
  username: string;

  @Column({ type: "varchar", length: 100, unique: true })
  email: string;

  @Column({ type: "varchar", length: 1000 })
  password: string;

  @Column({ type: "int", default: AuthStatus.Normal })
  status: number;

  @Column({ type: "boolean", default: false })
  verified: boolean;

  @Column({ type: "boolean", default: true })
  resettable: boolean;

  @Column({ type: "int", default: 0 })
  rolemask: number;

  @Column({ type: "datetime" })
  registered: Date;

  @Column({ type: "datetime", nullable: true })
  lastLogin: Date;

  @Column({ type: "int", default: 0 })
  forceLogout: number;

  @CreateDateColumn({ type: "datetime" })
  createdAt: Date;

  @UpdateDateColumn({ type: "datetime" })
  updatedAt: Date;

  @DeleteDateColumn({ type: "datetime" })
  deletedAt: Date;
}
