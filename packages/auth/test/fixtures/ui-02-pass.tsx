export function Ui02PassFixture() {
  return (
    <form>
      <input className="input" id="code" name="code" />
      <textarea className="input" id="notes" name="notes" />
      <input type="hidden" name="id" value="x" />
      <input type="checkbox" id="ok" name="ok" />
      <input type="radio" name="side" value="debit" />
      <input type="file" id="csv" name="csv" />
      <input type="submit" value="Save" />
    </form>
  );
}
