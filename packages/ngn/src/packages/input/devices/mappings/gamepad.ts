export interface GamepadMapping {
  axes: {
    0?: any;
    1?: any;
    2?: any;
    3?: any;
  };
  buttons: {
    0?: string;
    1?: string;
    2?: string;
    3?: string;
    4?: string;
    5?: string;
    6?: string;
    7?: string;
    8?: string;
    9?: string;
    10?: string;
    11?: string;
    12?: string;
    13?: string;
    14?: string;
    15?: string;
    16?: string;
    17?: string;
  };
}

export const SCUFVantage2 = (): GamepadMapping => {
  return {
    axes: {
      0: "MoveHorizontal",
      1: "MoveVertical",
      2: "LookHorizontal",
      3: "LookVertical",
    },
    buttons: {
      0: "X",
      1: "O",
      2: "Square",
      3: "Triangle",
      4: "L1",
      5: "R1",
      6: "L2",
      7: "R2",
      8: "Select",
      9: "Start",
      10: "LeftStick",
      11: "RightStick",
      12: "AnalogUp",
      13: "AnalogDown",
      14: "AnalogLeft",
      15: "AnalogRight",
      16: "Dashboard",
      17: "Touchpad",
    },
  };
};

export const PlayStation4 = (): GamepadMapping => SCUFVantage2();
export const PlayStation5 = (): GamepadMapping => SCUFVantage2();

export const Xbox = (): GamepadMapping => {
  return {
    axes: {
      0: "MoveHorizontal",
      1: "MoveVertical",
      2: "LookHorizontal",
      3: "LookVertical",
    },
    buttons: {
      0: "A",
      1: "B",
      2: "X",
      3: "Y",
      4: "LB",
      5: "RB",
      6: "LT",
      7: "RT",
      8: "Back",
      9: "Start",
      10: "LeftStick",
      11: "RightStick",
      12: "AnalogUp",
      13: "AnalogDown",
      14: "AnalogLeft",
      15: "AnalogRight",
      16: "Guide",
      17: "Touchpad",
    },
  };
};
