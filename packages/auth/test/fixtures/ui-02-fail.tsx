export function Ui02FailFixture() {
  return (
    <form>
      <select id="kind" name="kind">
        <option value="a">A</option>
      </select>
      <input type="date" id="when" name="when" />
      <input id="amount" name="amount" />
      <textarea id="notes" name="notes" />
    </form>
  );
}
