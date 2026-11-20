export default function PhotoGuide({
  view,
  room = false,
  category,
}: {
  view: string;
  room?: boolean;
  category: string;
}) {
  return (
    <div className="photo-guide">
      <svg
        viewBox="0 0 180 240"
        role="img"
        aria-label={
          room
            ? "Room photo: show the floor, wall and available space"
            : `${view} photo: head to feet, neck and body outline visible, camera at waist height`
        }
      >
        <rect
          x="12"
          y="8"
          width="156"
          height="224"
          rx="4"
          fill="none"
          stroke="currentColor"
          strokeDasharray="4 5"
        />
        {room ? (
          <g fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M25 25h130v150H25zM25 175l30-35h70l30 35M55 25v115M125 25v115" />
            <path d="M62 150h56v32H62zM62 182v14m56-14v14" />
          </g>
        ) : (
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <ellipse cx="90" cy="42" rx="15" ry="20" />
            <path d="M81 61v8l-20 9-13 68 9 3 13-49-3 47 5 66h14l4-60 4 60h14l5-66-3-47 13 49 9-3-13-68-20-9v-8" />
            <path d="M26 25v190m-4-184 4-6 4 6m-8 178 4 6 4-6M62 166h56m-50-4-6 4 6 4m44-8 6 4-6 4" />
            <text
              x="16"
              y="122"
              transform="rotate(-90 16 122)"
              fill="currentColor"
              stroke="none"
              fontSize="10"
            >
              HEIGHT
            </text>
            <text
              x="75"
              y="182"
              fill="currentColor"
              stroke="none"
              fontSize="10"
            >
              WIDTH
            </text>
          </g>
        )}
      </svg>
      <div>
        <h3>
          {room
            ? "Show the space, not a close-up"
            : "Help us keep your natural shape"}
        </h3>
        {room ? (
          <p>
            Photograph the room in daylight. Include the floor, nearby walls and
            the space where this piece will go. Keep the camera level.
          </p>
        ) : (
          <>
            <p>
              Ask someone to take a sharp {view} photo. Keep your face, neck,
              shoulders, waist and feet in frame. Stand naturally with arms
              slightly away from your body.
            </p>
            <p>
              Use fitted everyday clothing, even light and no beauty or body
              filters. Keep your neck and body outline visible; don’t crop,
              stretch or hide your natural proportions.
            </p>
            {category === "shoes" && (
              <p>Include both feet clearly, with nothing covering them.</p>
            )}
            {category === "watch" && (
              <p>
                Keep the wrist you want to style clearly visible, with your
                sleeve pulled back.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
