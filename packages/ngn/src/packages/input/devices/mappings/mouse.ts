export enum MouseButton {
  Mouse1 = "0", // e.button is 0
  Mouse2 = "2", // e.button is 2
  Mouse3 = "1", // e.button is 1
  Mouse4 = "3", // e.button is 3
  Mouse5 = "4", // e.button is 4
}

export interface MouseMapping {
  axes?: {
    0?: string;
    1?: string;
    2?: string;
  };
  buttons?: {
    0?: string;
    1?: string;
    2?: string;
    3?: string;
    4?: string;
  };
}

export const StandardMouse = (): MouseMapping => {
  return {
    axes: {
      0: "Horizontal",
      1: "Vertical",
      2: "Wheel",
    },
    buttons: {
      0: "Mouse1", // left
      1: "Mouse3", // middle
      2: "Mouse2", // right
      3: "Mouse4", // back
      4: "Mouse5", // forward
    },
  };
};
