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
    <section className="relative overflow-hidden border-y border-line bg-inverse text-on-inverse">
      <div
        aria-hidden
        className="absolute -right-24 -top-32 size-96 rounded-full bg-accent/25 blur-3xl"
      />
      <div className="page-gutter relative mx-auto max-w-page py-20 lg:py-28">
        <div className="mb-12 max-w-2xl lg:mb-16">
          <p className="eyebrow !text-clay-200">What clients say</p>
          <h2 className="mt-5 text-4xl leading-[1.02] text-on-inverse sm:text-5xl lg:text-6xl">
            1,400 five-star reviews, unedited.
          </h2>
        </div>

        <ul className="grid gap-4 lg:grid-cols-3 lg:gap-5">
          {TESTIMONIALS.map((testimonial, index) => (
            <Reveal as="li" key={testimonial.author} delay={index * 90}>
              <figure className="flex h-full flex-col rounded-[1.5rem] border border-on-inverse/12 bg-on-inverse/[0.055] p-6 backdrop-blur-sm sm:p-8">
                <Quotes
                  size={24}
                  weight="fill"
                  aria-hidden
                  className="mb-6 text-clay-200"
                />
                <blockquote className="flex-1 font-display text-xl leading-[1.55] text-on-inverse sm:text-[1.4rem]">
                  {testimonial.quote}
                </blockquote>
                <figcaption className="mt-7 border-t border-on-inverse/12 pt-5">
                  <Rating value={testimonial.rating} hideCount />
                  <p className="mt-3 text-sm font-semibold text-on-inverse">{testimonial.author}</p>
                  <p className="mt-1 text-xs text-on-inverse/60">{testimonial.detail}</p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
