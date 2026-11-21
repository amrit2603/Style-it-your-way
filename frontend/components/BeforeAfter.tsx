"use client";
import { useId, useState } from "react";
export default function BeforeAfter({
  before,
  after,
  fixture,
}: {
  before: string;
  after: string;
  fixture: boolean;
}) {
  const [position, setPosition] = useState(50);
  const id = useId();
  return (
    <figure className="before-after">
      <div className="before-after-canvas">
        <img src={before} alt="Your original photo" />
        <div
          className="before-after-overlay"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img
            src={after}
            alt={
              fixture
                ? "Fixed demonstration sample, not personalized"
                : "Your generated preview"
            }
          />
        </div>
        <div
          className="before-after-divider"
          style={{ left: `${position}%` }}
        />
        <span className="before-after-label after">
          {fixture ? "Demo sample" : "Preview"}
        </span>
        <span className="before-after-label before">Original</span>
      </div>
      <label htmlFor={id}>Compare original and preview</label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        aria-valuetext={`${position}% preview, ${100 - position}% original`}
      />
      <figcaption>
        {fixture
          ? "Fixed demonstration sample · not a personalized result"
          : "Move the slider to check the face, body shape and product details."}
      </figcaption>
    </figure>
  );
}
