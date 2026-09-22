import { Quotes } from "@phosphor-icons/react/dist/ssr";
import { Rating } from "@/components/ui/rating";
import { Reveal } from "@/components/ui/reveal";

const TESTIMONIALS = [
  {
    quote:
      "I bought the overcoat two winters ago and it has replaced three others. The hand-stitched edges have not moved a millimetre, and it still gets stopped in the street.",
    author: "Marguerite L.",
    detail: "Atelier Double-Faced Overcoat",
    rating: 5,
  },
  {
    quote:
      "The only cashmere I have owned that has not pilled. I asked why and got a two-paragraph answer about fibre length from an actual person, which tells you everything.",
    author: "Daniel O.",
    detail: "Grade-A Cashmere Crew",
    rating: 5,
  },
  {
    quote:
      "Ordered the wrong size, they collected it from my door the next morning and the exchange arrived two days later. No forms, no arguing.",
    author: "Priya R.",
    detail: "Wide-Leg Crepe Trouser",
    rating: 5,
  },
];

export function Testimonials() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="page-gutter mx-auto max-w-page py-16 lg:py-20">
        <div className="mb-12 text-center">
          <p className="eyebrow">What clients say</p>
          <h2 className="mt-4 text-3xl leading-tight sm:text-4xl">
            1,400 five-star reviews, unedited.
          </h2>
        </div>

        <ul className="grid gap-8 lg:grid-cols-3 lg:gap-12">
          {TESTIMONIALS.map((testimonial, index) => (
            <Reveal as="li" key={testimonial.author} delay={index * 90}>
              <figure className="flex h-full flex-col">
                <Quotes
                  size={22}
                  weight="fill"
                  aria-hidden
                  className="mb-5 text-clay-300 dark:text-clay-500"
                />
                <blockquote className="flex-1 font-display text-xl leading-relaxed text-content sm:text-[1.375rem]">
                  {testimonial.quote}
                </blockquote>
                <figcaption className="mt-6 border-t border-line pt-5">
                  <Rating value={testimonial.rating} hideCount />
                  <p className="mt-3 text-sm font-medium text-content">{testimonial.author}</p>
                  <p className="mt-0.5 text-xs text-content-muted">{testimonial.detail}</p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
