export class QueueItem {
  value: any;
  expireTime: number;

  constructor(value: any, expiresIn: number) {
    this.value = value;
    this.expireTime = Date.now() + expiresIn;
  }

  get expiresIn() {
    return this.expireTime - Date.now();
  }

  get isExpired() {
    return Date.now() > this.expireTime;
  }
}

export class Queue {
  items: any[] = [];

  add(item: any, expiresIn: number) {
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

  pop(): QueueItem | null {
    while (this.items.length) {
      const item = this.items.shift() as QueueItem;
      if (!item.isExpired) {
        return item;
      }
    }

    return null;
  }
}
