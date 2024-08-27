export class QueueItem<T> {
  value: T;
  private expiration: number;

  constructor(value: T, expiresIn: number) {
    this.value = value;
    this.expiration = Date.now() + expiresIn;
  }

  get expiresIn() {
    return this.expiration - Date.now();
  }

  get isExpired() {
    return Date.now() > this.expiration;
  }
}

export class Queue<T> {
  private items: QueueItem<T>[] = [];

  add(item: T, expiresIn: number) {
    this.items.push(new QueueItem(item, expiresIn));
  }

  get isEmpty() {
    let i = this.items.length;

    while (i--) {
      if (this.items[i].isExpired) {
        this.items.splice(i, 1);
      } else {
        return false;
      }
    }

    return true;
  }

  pop(): QueueItem<T> | null {
    while (this.items.length) {
      const item = this.items.shift();

      if (!item.isExpired) {
        return item;
      }
    }

    return null;
  }
}
