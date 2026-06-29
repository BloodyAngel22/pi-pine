import type { Transition, Variants } from "framer-motion";

export const panelSpring: Transition = {
  type: "tween",
  duration: 0.14,
  ease: [0.22, 1, 0.36, 1],
};

export const softEase: Transition = {
  duration: 0.12,
  ease: [0.22, 1, 0.36, 1],
};

export function sidePanelVariants(side: "left" | "right", reduceMotion: boolean): Variants {
  if (reduceMotion) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }

  const distance = side === "left" ? -10 : 10;
  return {
    hidden: { opacity: 0, x: distance },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: distance },
  };
}

export function messageItemVariants(reduceMotion: boolean): Variants {
  if (reduceMotion) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
    };
  }

  return {
    hidden: { opacity: 0, y: 4 },
    visible: { opacity: 1, y: 0 },
  };
}

export function floatingControlVariants(reduceMotion: boolean): Variants {
  if (reduceMotion) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }

  return {
    hidden: { opacity: 0, y: 4 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
  };
}

export function popoverContentVariants(reduceMotion: boolean): Variants {
  if (reduceMotion) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }

  return {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  };
}

export function modalOverlayVariants(reduceMotion: boolean): Variants {
  return {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  };
}

export function modalCardVariants(reduceMotion: boolean): Variants {
  if (reduceMotion) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }

  return {
    hidden: { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
  };
}

export function bottomSheetVariants(reduceMotion: boolean): Variants {
  if (reduceMotion) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }

  return {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
  };
}
